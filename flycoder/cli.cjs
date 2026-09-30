#!/usr/bin/env node
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { parseArgs } = require('node:util');
const { configFor, BASE_MODEL, MODEL, atomicJSON } = require('./core/config.cjs');
const { Runner, acquire } = require('./core/runner.cjs');
const { startServer, runDir } = require('./core/server.cjs');
const { applyRun } = require('./core/workspace.cjs');
const { train } = require('./core/training.cjs');
const model = require('./core/model.cjs');
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, workspace: { type: 'string' }, model: { type: 'string' }, host: { type: 'string' },
    port: { type: 'string' }, json: { type: 'boolean' }, 'base-model': { type: 'string' }, 'no-team': { type: 'boolean' },
    mode: { type: 'string' }, 'num-ctx': { type: 'string' }, 'max-turns': { type: 'string' }, trusted: { type: 'boolean' }
  } });
  if (values.help) return console.log(`FlyCoder 0.1 beta · Qwen3.5 + FlyBrain

flycoder                           Interactive Ollama-Code-derived TUI
flycoder run "task"                 Generate a checked proposal in an isolated copy
flycoder ui [--port 4317]           Open the local workbench server
flycoder install [--base-model ${BASE_MODEL}]  Install ${MODEL} into Ollama
flycoder doctor                    Check model and local runtime
flycoder init                      Write an example .flycoder.json if absent
flycoder train                     Train the controller on 4 fixed exercises
flycoder evaluate                  Evaluate 2 held-out exercises without training
flycoder apply <run-id>             Apply a proposal, refusing concurrent file changes

Options: --workspace <directory> --model <name> --host <URL> --mode code|plan|chat
         --num-ctx <n> --max-turns <n> --no-team --json
         --trusted (explicitly run checks without the macOS sandbox)

Checks are named argv arrays in .flycoder.json. Model weights remain Qwen3.5;
reward updates the FlyBrain routing controller. Review proposals in flycoder ui.`);
  const config = configFor(values.workspace || process.cwd(), {
    ...(values.model ? { model: values.model } : {}), ...(values.host ? { host: values.host } : {}),
    ...(values['num-ctx'] ? { numCtx: Number(values['num-ctx']) } : {}), ...(values['max-turns'] ? { maxTurns: Number(values['max-turns']) } : {}),
    ...(values['no-team'] ? { team: false } : {}), ...(values.trusted ? { execution: 'trusted' } : {}) });
  const command = positionals[0];
  if (!command) {
    if (!process.stdin.isTTY) throw new Error('Use flycoder run "task" for non-interactive input');
    const args = [];
    for (const [flag, value] of [['--model', config.model], ['--host', config.host], ['--num-ctx', String(config.numCtx)], ['--mode', values.mode || 'code']]) args.push(flag, value);
    const child = spawn(process.execPath, [require.resolve('tsx/cli'), '--tsconfig', path.join(__dirname, 'cli/tsconfig.json'), path.join(__dirname, 'cli/src/index.ts'), ...args], { cwd: config.workspace, stdio: 'inherit', env: { ...process.env, FLYCODER_SESSION_CONFIG: JSON.stringify(config) } });
    return new Promise(resolve => { child.on('error', e => { console.error(e.message); process.exitCode = 1; resolve(); }); child.on('exit', code => { process.exitCode = code || 0; resolve(); }); });
  }
  const emit = event => {
    if (values.json) return console.log(JSON.stringify(event));
    if (event.type === 'message') console.log(`\n[${event.role}] ${event.content}`);
    if (event.type === 'tool_start') console.log(`  · ${event.call.function.name} ${JSON.stringify(event.call.function.arguments).slice(0, 130)}`);
    if (event.type === 'check') console.log(`  ${event.ok ? '✓' : '✗'} ${event.name} (${event.durationMs} ms) ${event.output.slice(-300)}`);
    if (event.type === 'error') console.error(event.error);
    if (event.type === 'training_progress') console.log(`Training ${event.completed}/${event.total}: ${event.result.status}`);
  };
  if (command === 'doctor') return console.log(JSON.stringify({ model: config.model, ...(await model.status(config)), sandbox: process.platform === 'darwin' && fs.existsSync('/usr/bin/sandbox-exec'), workspace: config.workspace, checks: config.checks }, null, 2));
  if (command === 'install') return console.log(await model.install(config, { baseModel: values['base-model'] || BASE_MODEL, onProgress: p => { if (p.status && !p.completed) console.log(p.status); } }));
  if (command === 'init') {
    const file = path.join(config.workspace, '.flycoder.json'); if (fs.existsSync(file)) throw new Error('.flycoder.json already exists');
    atomicJSON(file, { model: MODEL, numCtx: 16384, execution: 'sandbox', team: true, checks: {} });
    return console.log(`Created ${file}. Add checks, e.g. "checks": {"test": ["node", "--test"]}.`);
  }
  if (command === 'ui') {
    const app = await startServer(config, { port: Number(values.port || 4317) }); console.log(`FlyCoder: ${app.url}\nWorkspace: ${config.workspace}`);
    process.on('SIGINT', () => app.close().then(() => process.exit(0))); process.on('SIGTERM', () => app.close().then(() => process.exit(0))); return;
  }
  if (command === 'apply') { const release = acquire(config.dataDir); try { return console.log({ applied: applyRun(runDir(config, positionals[1]), config.workspace) }); } finally { release(); } }
  if (command === 'train' || command === 'evaluate') {
    const controller = new AbortController(); const abort = () => controller.abort(); process.once('SIGINT', abort);
    try { const report = await train(config, { evaluate: command === 'evaluate', onEvent: emit, signal: controller.signal }); console.log(JSON.stringify(report, null, 2)); if (report.passed !== report.total) process.exitCode = 1; }
    finally { process.off('SIGINT', abort); } return;
  }
  if (command === 'run') {
    const task = positionals.slice(1).join(' '); const runner = new Runner(config, { onEvent: emit });
    const abort = () => runner.abort(); process.once('SIGINT', abort);
    try { const run = await runner.start(task, { mode: values.mode || 'code' }); console.log(JSON.stringify({ id: run.id, status: run.status, reward: run.reward, changes: run.changes.map(c => c.path), error: run.error }, null, 2));
      if (['failed', 'error', 'cancelled'].includes(run.status)) process.exitCode = 1;
    } finally { process.off('SIGINT', abort); } return;
  }
  throw new Error(`Unknown command: ${command}. Use --help.`);
}
main().catch(error => { console.error(`FlyCoder: ${error.message}`); process.exitCode = 1; });
