#!/usr/bin/env node
// FlyBrain: an Ollama-compatible server that answers to `flycoder` and `flycoder:fast`,
// routes each request to one expert model and keeps a single expert in memory.
// Usage: node brain/flybrain.mjs [--port 11435] [--ollama http://127.0.0.1:11434] [--prefix delairvictor9/] [--max-expert auto|full|fast]
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Memory, profiles, route } from './router.mjs';

const ROUTED = new Set(['/api/chat', '/api/generate', '/v1/chat/completions', '/v1/messages', '/v1/completions']);

// One expert at a time: a request for another expert waits for the running ones,
// then the previous expert (and the micro-model, before a large expert) is unloaded.
export class Scheduler {
  constructor(unload) { this.unload = unload; this.current = null; this.active = 0; this.queue = []; this.switching = null; }
  async acquire(expert, evict = []) {
    while (this.switching || ((this.current !== expert || this.queue.length) && this.active > 0)) await (this.switching || new Promise(resolve => this.queue.push(resolve)));
    if (this.current !== expert) {
      const stale = [this.current, ...evict].filter(m => m && m !== expert);
      this.switching = Promise.all(stale.map(m => this.unload(m).catch(() => {}))).then(() => { this.current = expert; this.switching = null; });
      await this.switching;
    }
    this.active++;
    let released = false;
    return () => { if (released) return; released = true; if (--this.active === 0) this.queue.splice(0).forEach(resolve => resolve()); };
  }
}

export function createFlyBrain({ ollama = 'http://127.0.0.1:11434', prefix = '', maxExpert = 'full', log = console.error, routerTimeoutMs = 8000 } = {}) {
  const upstream = ollama.replace(/\/$/, '');
  const table = profiles(prefix, { maxExpert });
  const memory = new Memory();
  const post = (path, body, signal) => fetch(upstream + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  const scheduler = new Scheduler(model => post('/api/generate', { model, keep_alive: 0 }).then(r => r.arrayBuffer()));
  const routers = new Set(Object.values(table).map(p => p.router).filter(Boolean));

  async function askRouter(model, text) {
    const response = await post('/api/chat', { model, stream: false, think: false, keep_alive: '10m', messages: [{ role: 'user', content: text }],
      format: { type: 'object', properties: { level: { type: 'string', enum: ['simple', 'hard'] } }, required: ['level'] },
      options: { temperature: 0, num_predict: 16 } }, AbortSignal.timeout(routerTimeoutMs));
    if (!response.ok) throw new Error(`router ${response.status}`);
    return JSON.parse((await response.json()).message?.content || '{}').level;
  }

  async function forward(req, res, path, body, headers = {}) {
    const raw = body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body);
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableFinished) abort.abort(); });
    const response = await fetch(upstream + path, { method: req.method, signal: abort.signal, duplex: 'half', body: raw,
      headers: { 'content-type': req.headers['content-type'] || 'application/json', ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) } });
    const out = { ...headers };
    for (const name of ['content-type', 'cache-control']) if (response.headers.get(name)) out[name] = response.headers.get(name);
    res.writeHead(response.status, out);
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  }

  async function handle(req, res) {
    const path = new URL(req.url, 'http://flybrain').pathname;
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    let body; try { body = raw.length ? JSON.parse(raw) : undefined; } catch {}
    const profile = body && table[body.model];
    if (!profile || !(ROUTED.has(path) || path === '/api/show')) return forward(req, res, req.url, raw.length ? raw : undefined);
    // Metadata (tools, thinking, context) comes from the strongest expert.
    if (path === '/api/show') return forward(req, res, req.url, { ...body, model: profile.hard });

    const decision = await route(body.model, body, { profile, memory, askRouter, loaded: scheduler.current });
    log(`[flybrain] ${body.model} → ${decision.expert} (${decision.level}: ${decision.reason})`);
    const rewritten = { ...body, model: decision.expert };
    // The normal profile trades a little time for quality: it thinks unless the client said otherwise.
    if (profile.think && rewritten.think === undefined && (path === '/api/chat' || path === '/api/generate')) rewritten.think = true;
    const evict = decision.expert === profile.hard && profile.hard !== profile.simple ? [...routers] : [];
    const release = await scheduler.acquire(decision.expert, evict);
    res.on('close', release);
    try { await forward(req, res, req.url, rewritten, { 'x-flybrain-expert': decision.expert, 'x-flybrain-reason': `${decision.level}: ${decision.reason}` }); }
    finally { release(); }
  }

  return http.createServer((req, res) => handle(req, res).catch(error => {
    if (res.destroyed) return; // the client hung up: nothing to report
    log(`[flybrain] ${error.message}`);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(res.headersSent ? undefined : JSON.stringify({ error: `FlyBrain: ${error.message}` }));
  }));
}

// Below 16 GB the large expert does not fit next to the system: cap at the 4B.
export function defaultMaxExpert(totalBytes = os.totalmem()) { return totalBytes / 2 ** 30 >= 15 ? 'full' : 'fast'; }

function main() {
  const { values } = parseArgs({ options: { port: { type: 'string', default: process.env.FLYBRAIN_PORT || '11435' }, host: { type: 'string', default: '127.0.0.1' },
    ollama: { type: 'string', default: process.env.OLLAMA_HOST ? `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, '')}` : 'http://127.0.0.1:11434' },
    prefix: { type: 'string', default: '' }, 'max-expert': { type: 'string', default: 'auto' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) return console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 4).join('\n').replace(/^\/\/ ?/gm, ''));
  const maxExpert = values['max-expert'] === 'auto' ? defaultMaxExpert() : values['max-expert'];
  if (!['full', 'fast'].includes(maxExpert)) throw new Error('--max-expert must be auto, full or fast');
  const server = createFlyBrain({ ollama: values.ollama, prefix: values.prefix, maxExpert });
  server.listen(Number(values.port), values.host, () => console.error(`FlyBrain listening on http://${values.host}:${values.port} (Ollama: ${values.ollama}, max expert: ${maxExpert}). Models: flycoder, flycoder:fast`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`FlyBrain: ${error.message}`); process.exitCode = 1; }
}
