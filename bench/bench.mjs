#!/usr/bin/env node
// FlyCoder bench: pass rate and speed of Ollama models on hidden-test coding problems.
// Usage: node bench/bench.mjs --models flycoder:0.2-beta,flycoder:0.2-beta-fast [--think off]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROBLEMS } from './problems.mjs';

const ALIASES = { python: ['python', 'py', 'python3'], javascript: ['javascript', 'js', 'mjs', 'node', 'jsx'] };
const FILES = { python: ['solution.py', 'test_solution.py'], javascript: ['solution.mjs', 'test.mjs'] };

// Picks the fenced block most likely to hold the solution: right language,
// defines the entry point, longest wins. Falls back to the raw answer.
export function extractCode(content, language, entry) {
  const blocks = [...content.matchAll(/```([\w+-]*)[^\n]*\n([\s\S]*?)```/g)].map(m => ({ tag: m[1].toLowerCase(), code: m[2] }));
  const typed = blocks.filter(b => !b.tag || ALIASES[language].includes(b.tag));
  const candidates = typed.length ? typed : blocks;
  if (!candidates.length) return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim() + '\n';
  const defining = candidates.filter(b => new RegExp(`\\b${entry}\\b`).test(b.code));
  const pool = defining.length ? defining : candidates;
  let code = pool.reduce((best, b) => (b.code.length > best.code.length ? b : best)).code;
  if (language === 'javascript' && !/\bexport\b/.test(code) && new RegExp(`(function|class|const|let|var)\\s+${entry}\\b`).test(code)) code += `\nexport { ${entry} };\n`;
  return code;
}

// Denies network access and writes outside the scratch directory on macOS.
function sandboxed(argv, dir) {
  if (process.platform !== 'darwin' || !fs.existsSync('/usr/bin/sandbox-exec')) return null;
  const profile = `(version 1)\n(allow default)\n(deny network*)\n(deny file-write*)\n(allow file-write* (subpath ${JSON.stringify(dir)}) (literal "/dev/null"))\n`;
  return ['/usr/bin/sandbox-exec', '-p', profile, ...argv];
}

export async function runTest(problem, code, { timeoutMs = 15000, sandbox = true } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flycoder-bench-')));
  const [solution, test] = FILES[problem.language];
  try {
    fs.writeFileSync(path.join(dir, solution), code);
    fs.writeFileSync(path.join(dir, test), problem.language === 'python' ? `from solution import ${problem.entry}\n${problem.test}` : problem.test);
    let argv = problem.language === 'python' ? ['python3', test] : [process.execPath, test];
    if (sandbox) argv = sandboxed(argv, dir) || argv;
    const started = Date.now();
    return await new Promise(resolve => {
      let output = '', timedOut = false;
      const child = spawn(argv[0], argv.slice(1), { cwd: dir, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH, HOME: dir, TMPDIR: dir, LANG: 'en_US.UTF-8', PYTHONDONTWRITEBYTECODE: '1' } });
      const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
      const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
      const collect = chunk => { if (output.length < 4000) output += chunk.toString().slice(0, 4000 - output.length); };
      child.stdout.on('data', collect); child.stderr.on('data', collect);
      child.on('error', error => { clearTimeout(timer); resolve({ ok: false, output: error.message, timedOut, durationMs: Date.now() - started }); });
      child.on('close', code => { clearTimeout(timer); kill(); resolve({ ok: code === 0 && !timedOut, output, timedOut, durationMs: Date.now() - started }); });
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

async function ollama(host, route, body, timeoutMs = 3600000) {
  const response = await fetch(host.replace(/\/$/, '') + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeoutMs) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(`Ollama ${response.status}: ${data.error || 'request failed'}`);
  return data;
}

// Small Macs cannot hold two models at once: start each model with free memory.
async function unloadAll(host) {
  const { models = [] } = await ollama(host, '/api/ps').catch(() => ({}));
  for (const m of models) await ollama(host, '/api/generate', { model: m.name, keep_alive: 0 }).catch(() => {});
}

export function instruction(problem) {
  const format = problem.language === 'python'
    ? 'Return the complete implementation in a single ```python code block. Do not include tests or example usage.'
    : 'Return the complete implementation in a single ```javascript code block, as an ES module that exports it with `export function` (or `export class`). Do not include tests or example usage.';
  return `${problem.prompt}\n\n${format}`;
}

// Streams the answer: a non-streamed request sends nothing until it is done, and
// fetch gives up waiting for response headers after 5 minutes (long thinking, slow machines).
export async function chat(host, body, timeoutMs = 3600000) {
  const response = await fetch(host.replace(/\/$/, '') + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, stream: true }), signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const text = await response.text();
    let message = text; try { message = JSON.parse(text).error || text; } catch {}
    throw new Error(`Ollama ${response.status}: ${message.slice(0, 300)}`);
  }
  let content = '', thinking = '', last = {}, buffer = '';
  const decoder = new TextDecoder();
  const read = line => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.error) throw new Error(`Ollama: ${event.error}`);
    content += event.message?.content || ''; thinking += event.message?.thinking || '';
    if (event.done) last = event;
  };
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n'); buffer = lines.pop();
    lines.forEach(read);
  }
  read(buffer + decoder.decode());
  if (!last.done) throw new Error('Ollama: incomplete response');
  return { ...last, message: { content, thinking } };
}

export async function solve(host, model, problem, { think, seed, maxTokens, numCtx }) {
  const started = Date.now();
  const data = await chat(host, { model, messages: [{ role: 'user', content: instruction(problem) }],
    ...(think === undefined ? {} : { think }), options: { seed, num_predict: maxTokens, ...(numCtx ? { num_ctx: numCtx } : {}) } });
  const content = data.message?.content || '';
  return { content, truncated: data.done_reason === 'length', wallMs: Date.now() - started, loadMs: Math.round((data.load_duration || 0) / 1e6),
    outputTokens: data.eval_count || 0, decodeMs: (data.eval_duration || 0) / 1e6, promptTokens: data.prompt_eval_count || 0, prefillMs: (data.prompt_eval_duration || 0) / 1e6,
    thinkingChars: (data.message?.thinking || '').length };
}

export function summarize(model, results) {
  const sum = key => results.reduce((total, r) => total + (r[key] || 0), 0);
  const passed = results.filter(r => r.ok).length;
  return { model, passed, total: results.length, passRate: results.length ? passed / results.length : 0,
    decodeTokensPerSecond: sum('decodeMs') ? sum('outputTokens') / (sum('decodeMs') / 1000) : null,
    prefillTokensPerSecond: sum('prefillMs') ? sum('promptTokens') / (sum('prefillMs') / 1000) : null,
    meanOutputTokens: results.length ? sum('outputTokens') / results.length : 0,
    meanSecondsPerProblem: results.length ? (sum('wallMs') - sum('loadMs')) / results.length / 1000 : 0,
    truncated: results.filter(r => r.truncated).length };
}

export function table(summaries) {
  const rows = summaries.map(s => `| ${s.model} | ${s.passed}/${s.total} (${(s.passRate * 100).toFixed(0)} %) | ${s.decodeTokensPerSecond?.toFixed(1) ?? '-'} | ${s.prefillTokensPerSecond?.toFixed(0) ?? '-'} | ${s.meanOutputTokens.toFixed(0)} | ${s.meanSecondsPerProblem.toFixed(1)} |`);
  return ['| Model | Tests passed | Generation (tok/s) | Prompt processing (tok/s) | Tokens generated / problem | Seconds / problem |', '|---|---|---|---|---|---|', ...rows].join('\n');
}

async function main() {
  const { values } = parseArgs({ options: {
    models: { type: 'string', default: 'flycoder:0.2-beta,flycoder:0.2-beta-fast' }, host: { type: 'string', default: process.env.OLLAMA_HOST ? `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, '')}` : 'http://127.0.0.1:11434' },
    think: { type: 'string', default: 'default' }, samples: { type: 'string', default: '1' }, only: { type: 'string' },
    'max-tokens': { type: 'string', default: '8192' }, 'num-ctx': { type: 'string' }, out: { type: 'string' }, 'no-sandbox': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) return console.log('node bench/bench.mjs --models a,b [--think on|off|default] [--samples n] [--only id,id] [--max-tokens n] [--num-ctx n] [--out file.json] [--no-sandbox]');
  const think = { on: true, off: false, default: undefined }[values.think];
  if (!(values.think in { on: 1, off: 1, default: 1 })) throw new Error('--think must be on, off or default');
  // --num-ctx overrides the model's context for machines short on memory; it does not change answers to these short prompts.
  const samples = Number(values.samples), maxTokens = Number(values['max-tokens']), numCtx = values['num-ctx'] ? Number(values['num-ctx']) : undefined;
  const only = values.only ? new Set(values.only.split(',')) : null;
  const problems = PROBLEMS.filter(p => !only || only.has(p.id));
  const sandbox = !values['no-sandbox'];
  const preflight = await runTest(problems[0], problems[0].reference, { sandbox });
  if (!preflight.ok) throw new Error(`Reference solution failed in the test runner (${preflight.output.slice(0, 300)}). Check python3/node, or retry with --no-sandbox.`);

  const report = { at: new Date().toISOString(), host: values.host, think: values.think, samples, maxTokens, numCtx: numCtx ?? 'model default', platform: `${os.platform()} ${os.arch()} ${os.cpus()[0]?.model || ''}`.trim(), memoryGiB: Math.round(os.totalmem() / 2 ** 30), models: [] };
  const out = values.out || path.join(path.dirname(fileURLToPath(import.meta.url)), 'results', `${report.at.replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // Saved after every answer, so an interrupted run keeps its measurements.
  const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  for (const model of values.models.split(',').map(m => m.trim()).filter(Boolean)) {
    const results = [], entry = { summary: summarize(model, results), results };
    report.models.push(entry);
    await unloadAll(values.host);
    for (const problem of problems) for (let i = 0; i < samples; i++) {
      process.stderr.write(`${model} · ${problem.id}${samples > 1 ? ` #${i + 1}` : ''} … `);
      try {
        const ask = () => solve(values.host, model, problem, { think, seed: 1000 + i, maxTokens, numCtx });
        // A crashed or failed model load is retried once with all models unloaded; it is not an answer.
        const answer = await ask().catch(async error => { if (!/llama-server|runner|resource|load|memory|fetch failed/i.test(error.message)) throw error; await unloadAll(values.host); return ask(); });
        const outcome = answer.truncated ? { ok: false, output: 'truncated by max tokens' } : await runTest(problem, extractCode(answer.content, problem.language, problem.entry), { sandbox });
        const { content, ...metrics } = answer;
        results.push({ problem: problem.id, sample: i, ok: outcome.ok, error: outcome.ok ? null : outcome.output.slice(-600), ...metrics, answer: content });
        process.stderr.write(`${outcome.ok ? 'ok' : 'FAIL'} (${answer.outputTokens} tok, ${(answer.wallMs / 1000).toFixed(1)} s)\n`);
      } catch (error) {
        results.push({ problem: problem.id, sample: i, ok: false, error: error.message });
        process.stderr.write(`error: ${error.message}\n`);
      }
      entry.summary = summarize(model, results); save();
    }
    await unloadAll(values.host);
  }
  save();
  console.log(table(report.models.map(m => m.summary)));
  console.log(`\nDetails: ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch(error => { console.error(`FlyCoder bench: ${error.message}`); process.exitCode = 1; });
}
