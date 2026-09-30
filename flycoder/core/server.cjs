'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROOT, readJSON, atomicJSON } = require('./config.cjs');
const { Runner, acquire } = require('./runner.cjs');
const { FlyBrain } = require('./brain.cjs');
const { applyRun, list, safePath, textFile } = require('./workspace.cjs');
const { train } = require('./training.cjs');
const model = require('./model.cjs');
function runs(config) {
  const dir = path.join(config.dataDir, 'runs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort().reverse().slice(0, 50).flatMap(id => {
    try { const r = readJSON(path.join(dir, id, 'run.json'), null); return r ? [{ id, task: r.task, status: r.status, reward: r.reward, at: r.startedAt, changes: r.changes.length }] : []; } catch { return []; }
  });
}
function runDir(config, id) { if (!/^[\w-]{1,80}$/.test(id)) throw new Error('Invalid run id'); return path.join(config.dataDir, 'runs', id); }
async function startServer(config, { port = 4317 } = {}) {
  const token = crypto.randomBytes(32).toString('hex'); const clients = new Set(); let active = null, training = null, latest = null, installing = false;
  const broadcast = e => { for (const client of clients) client.write(`data: ${JSON.stringify(e)}\n\n`); };
  const event = (e, run) => { if (run) latest = run; broadcast(e); };
  const json = (res, code, value) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    try {
      const expected = `127.0.0.1:${server.address().port}`;
      if (![expected, `localhost:${server.address().port}`].includes(req.headers.host)) return json(res, 403, { error: 'Invalid host' });
      if (req.headers.origin && ![`http://${expected}`, `http://localhost:${server.address().port}`].includes(req.headers.origin)) return json(res, 403, { error: 'Invalid origin' });
      res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('referrer-policy', 'no-referrer');
      const url = new URL(req.url, `http://${expected}`);
      let body = {};
      if (req.method === 'POST') {
        if (req.headers['x-flycoder-token'] !== token) return json(res, 403, { error: 'Invalid session token' });
        let input = ''; for await (const chunk of req) { input += chunk; if (Buffer.byteLength(input) > 64000) return json(res, 413, { error: 'Body too large' }); }
        try { body = JSON.parse(input || '{}'); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
      }
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        res.write(': connected\n\n'); clients.add(res); const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
        req.on('close', () => { clients.delete(res); clearInterval(heartbeat); }); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, {
        version: '0.1 beta', model: config.model, localInference: ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(config.host).hostname) && !config.model.includes('cloud'), workspace: config.workspace, execution: config.execution, checks: config.checks, numCtx: config.numCtx,
        busy: !!(active || training || installing), activeId: latest?.status === 'running' ? latest.id : null, runs: runs(config),
        brain: latest?.brain || new FlyBrain(config.dataDir).snapshot(), ollama: await model.status(config),
        training: readJSON(path.join(config.dataDir, 'training.json'), null), evaluation: readJSON(path.join(config.dataDir, 'evaluation.json'), null) });
      if (req.method === 'GET' && url.pathname === '/api/run') {
        const id = url.searchParams.get('id'); const run = latest?.id === id ? latest : readJSON(path.join(runDir(config, id), 'run.json'), null);
        if (!run) return json(res, 404, { error: 'Run not found' }); return json(res, 200, run);
      }
      if (req.method === 'GET' && url.pathname === '/api/files') return json(res, 200, list(config.workspace));
      if (req.method === 'GET' && url.pathname === '/api/file') return json(res, 200, { content: textFile(safePath(config.workspace, url.searchParams.get('path'))) });
      if (req.method === 'POST' && url.pathname === '/api/run') {
        if (active || training || installing) return json(res, 409, { error: 'Une opération est déjà en cours.' });
        if (typeof body.task !== 'string' || !body.task.trim() || body.task.length > 8000 || !['code', 'plan', 'chat'].includes(body.mode || 'code')) return json(res, 400, { error: 'Mission ou mode invalide.' });
        active = new Runner(config, { onEvent: event });
        const promise = active.start(body.task, { mode: body.mode || 'code' });
        json(res, 202, { started: true });
        promise.catch(error => broadcast({ type: 'error', error: error.message })).finally(() => { active = null; broadcast({ type: 'idle' }); }); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/stop') { active?.abort(); training?.abort(); return json(res, 200, { stopped: true }); }
      if (req.method === 'POST' && url.pathname === '/api/apply') {
        if (active || training) return json(res, 409, { error: 'Attendez la fin de la mission.' });
        const release = acquire(config.dataDir); try { return json(res, 200, { applied: applyRun(runDir(config, body.id), config.workspace) }); } finally { release(); }
      }
      if (req.method === 'POST' && url.pathname === '/api/feedback') {
        if (active || training) return json(res, 409, { error: 'Attendez la fin de la mission.' });
        if (![1, -1].includes(body.value)) return json(res, 400, { error: 'Feedback invalide' });
        const release = acquire(config.dataDir);
        try {
          const dir = runDir(config, body.id), run = readJSON(path.join(dir, 'run.json'), null);
          if (!run || run.feedback || !['passed', 'failed', 'unverified'].includes(run.status)) return json(res, 409, { error: 'Feedback indisponible ou déjà enregistré.' });
          run.feedback = { value: body.value, at: new Date().toISOString() };
          const brain = new FlyBrain(config.dataDir); brain.learn(run.decision, body.value * 0.25); run.brain = brain.snapshot(); atomicJSON(path.join(dir, 'run.json'), run);
          if (latest?.id === run.id) latest = run; return json(res, 200, { feedback: run.feedback, brain: run.brain });
        } finally { release(); }
      }
      if (req.method === 'POST' && url.pathname === '/api/train') {
        if (active || training || installing) return json(res, 409, { error: 'Une opération est déjà en cours.' });
        training = new AbortController(); json(res, 202, { started: true });
        train(config, { evaluate: body.evaluate === true, onEvent: event, signal: training.signal }).then(report => broadcast({ type: 'training_complete', report }))
          .catch(error => broadcast({ type: 'error', error: error.message })).finally(() => { training = null; latest = null; broadcast({ type: 'idle' }); }); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/install') {
        if (active || training || installing) return json(res, 409, { error: 'Une opération est déjà en cours.' });
        installing = true; json(res, 202, { started: true });
        model.install(config, { onProgress: progress => broadcast({ type: 'install', progress }) }).then(result => broadcast({ type: 'installed', ...result }))
          .catch(error => broadcast({ type: 'error', error: error.message })).finally(() => { installing = false; broadcast({ type: 'idle' }); }); return;
      }
      if (req.method !== 'GET') return json(res, 404, { error: 'Unknown route' });
      const assets = { '/': 'flycoder/web/index.html', '/app.js': 'flycoder/web/app.js', '/style.css': 'flycoder/web/style.css' };
      if (!Object.hasOwn(assets, url.pathname)) return json(res, 404, { error: 'Not found' });
      const file = path.join(ROOT, assets[url.pathname]), ext = path.extname(file);
      res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      res.setHeader('content-type', { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }[ext]);
      res.setHeader('cache-control', 'no-store');
      const data = fs.readFileSync(file); res.end(ext === '.html' ? data.toString().replace('__TOKEN__', token) : data);
    } catch (error) { if (!res.headersSent) json(res, 400, { error: error.message }); else res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}`, close: async () => { active?.abort(); training?.abort(); for (const c of clients) c.end(); await new Promise(r => server.close(r)); } };
}
module.exports = { startServer, runs, runDir };
