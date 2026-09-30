'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configFor, atomicJSON } = require('../flycoder/core/config.cjs');
const { FlyBrain } = require('../flycoder/core/brain.cjs');
const { encode, decode, transcript } = require('../flycoder/core/protocol.cjs');
const { Memory, compact } = require('../flycoder/core/memory.cjs');
const { safePath, list, createWorkspace, changes, applyRun, runCheck } = require('../flycoder/core/workspace.cjs');
const { Runner, acquire } = require('../flycoder/core/runner.cjs');
const { startServer } = require('../flycoder/core/server.cjs');
const http = require('node:http');
const model = require('../flycoder/core/model.cjs');
const temp = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flycoder-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return fs.realpathSync(dir); };
const answer = (content = 'Done', calls = []) => ({ message: { content, ...(calls.length ? { tool_calls: calls } : {}) }, metrics: { durationMs: 1, promptTokens: 10, outputTokens: 5, tokensPerSecond: 5 } });
const call = (name, args) => ({ function: { name, arguments: args } });
test('FlyLink preserves Unicode, newlines and nested JSON without lossy decoding', () => {
  const value = { text: 'mouche 🪰\nreturn "a|b"', errors: [{ line: 3 }] };
  const packet = encode(7, 'p', 'c', 'task', value);
  assert.deepEqual(decode(JSON.stringify(packet)).payload, value); assert.match(transcript(packet), /Architecte → Codeur/);
  assert.throws(() => decode([2, 1, 'p', 'c', 'task', {}])); assert.throws(() => decode([1, 1, 'x', 'c', 'task', {}]));
});
test('positive and negative reward update actual routing weights; reload and graph agree', t => {
  const d = temp(t), b = new FlyBrain(d), decision = b.choose('fix python parser', { explore: true });
  const before = JSON.stringify(b.state.weights); b.learn(decision, 1);
  assert.notEqual(JSON.stringify(b.state.weights), before); assert.equal(b.state.episodes, 1);
  const loaded = new FlyBrain(d); assert.deepEqual(loaded.state.weights, b.state.weights);
  const edge = loaded.snapshot().edges.find(e => e.from === 'KC_0' && e.to === 'SWE_inspect'); assert.equal(edge.weight, loaded.state.weights[0][0]);
  const score = b.state.bias[decision.action]; b.learn(decision, -1); assert.ok(b.state.bias[decision.action] < score);
  assert.equal(b.snapshot().qwenActivationsAvailable, false);
});
test('exploration exercises each routing strategy and negative memory is excluded', t => {
  const d = temp(t), b = new FlyBrain(d), strategies = [];
  for (let i = 0; i < 3; i++) { const decision = b.choose('test arrays', { explore: true }); strategies.push(decision.name); b.learn(decision, 1); }
  assert.equal(new Set(strategies).size, 3);
  const m = new Memory(d); m.add({ task: 'fix arrays', lesson: 'bad', reward: -1 }); m.add({ task: 'fix arrays', lesson: 'good', reward: 1 });
  assert.deepEqual(m.recall('fix arrays').map(e => e.lesson), ['good']);
});
test('context compaction keeps task and complete tool groups under its byte budget', () => {
  const initial = [{ role: 'system', content: 'rules' }, { role: 'user', content: 'original task' }];
  const messages = [...initial];
  for (let i = 0; i < 20; i++) messages.push({ role: 'assistant', content: '', tool_calls: [call('read_file', { path: 'a' })] }, { role: 'tool', tool_name: 'read_file', content: 'x'.repeat(300) });
  const result = compact(messages, 4096); assert.equal(result.compacted, true); assert.deepEqual(result.messages.slice(0, 2), initial);
  assert.ok(result.after <= 2048); assert.equal(result.messages[3].role, 'assistant');
});
test('workspace rejects traversal, secrets, symlinks and dangling symlinks', t => {
  const d = temp(t), outside = temp(t); fs.writeFileSync(path.join(d, 'source.js'), 'ok'); fs.writeFileSync(path.join(d, '.env'), 'not for model');
  fs.symlinkSync(outside, path.join(d, 'escape')); fs.symlinkSync(path.join(outside, 'missing'), path.join(d, 'dangling'));
  for (const p of ['../a', '/tmp/a', '.env', 'x/.env.local', 'escape/a', 'dangling']) assert.throws(() => safePath(d, p));
  assert.deepEqual(list(d), ['source.js']);
});
test('proposal application checks all conflicts before writing and respects source workspace', t => {
  const src = temp(t), dir = temp(t); fs.writeFileSync(path.join(src, 'a.js'), 'old'); fs.writeFileSync(path.join(src, 'b.js'), 'old');
  const work = createWorkspace(src, dir); fs.writeFileSync(path.join(work, 'a.js'), 'new'); fs.writeFileSync(path.join(work, 'b.js'), 'new');
  atomicJSON(path.join(dir, 'run.json'), { status: 'passed', baseWorkspace: src });
  fs.writeFileSync(path.join(src, 'b.js'), 'concurrent'); assert.throws(() => applyRun(dir, src), /Conflict/); assert.equal(fs.readFileSync(path.join(src, 'a.js'), 'utf8'), 'old');
  assert.throws(() => applyRun(dir, temp(t)), /another workspace/);
  fs.writeFileSync(path.join(src, 'b.js'), 'old'); assert.equal(applyRun(dir, src).length, 2); assert.equal(changes(dir).length, 2);
});
test('check runner reports failures, output, timeout and cancellation', async t => {
  const d = temp(t);
  const failure = await runCheck([process.execPath, '-e', 'console.error("bad");process.exit(7)'], { cwd: d, execution: 'trusted' });
  assert.equal(failure.ok, false); assert.equal(failure.exitCode, 7); assert.match(failure.output, /bad/);
  const timeout = await runCheck([process.execPath, '-e', 'setInterval(()=>{},1000)'], { cwd: d, execution: 'trusted', timeoutMs: 100 }); assert.equal(timeout.timedOut, true);
  const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 100);
  const stopped = await runCheck([process.execPath, '-e', 'setInterval(()=>{},1000)'], { cwd: d, execution: 'trusted', signal: ctrl.signal }); assert.equal(stopped.cancelled, true);
});
test('macOS sandbox prevents outside writes, private reads and network while allowing a test', { skip: process.platform !== 'darwin' }, async t => {
  const d = temp(t), privateDir = fs.mkdtempSync(path.join(os.homedir(), '.flycoder-sandbox-test-'));
  t.after(() => fs.rmSync(privateDir, { recursive: true, force: true })); fs.writeFileSync(path.join(privateDir, 'sentinel'), 'private');
  const script = `const fs=require('fs');const a=require('assert');a.throws(()=>fs.readFileSync(${JSON.stringify(path.join(privateDir, 'sentinel'))}));a.throws(()=>fs.writeFileSync(${JSON.stringify(path.join(privateDir, 'write'))},'bad'));fs.writeFileSync('allowed','ok');const net=require('net');const s=net.connect(9,'127.0.0.1');s.on('connect',()=>process.exit(9));s.on('error',()=>console.log('network denied'));`;
  const result = await runCheck([process.execPath, '-e', script], { cwd: d }); assert.equal(result.ok, true, result.output); assert.equal(fs.existsSync(path.join(privateDir, 'write')), false); assert.equal(fs.readFileSync(path.join(d, 'allowed'), 'utf8'), 'ok');
});
test('installed dependencies can be read by a check but cannot be changed', { skip: process.platform !== 'darwin' }, async t => {
  const source = temp(t), runDir = temp(t), dependencies = path.join(source, 'node_modules');
  fs.mkdirSync(path.join(dependencies, 'example'), { recursive: true }); fs.writeFileSync(path.join(dependencies, 'example/index.js'), 'module.exports = 42;');
  const cwd = createWorkspace(source, runDir);
  const result = await runCheck([process.execPath, '-e', 'const a=require("assert");a.equal(require("example"),42);a.throws(()=>require("fs").writeFileSync("node_modules/example/index.js","bad"));'], { cwd, extraRead: [dependencies] });
  assert.equal(result.ok, true, result.output); assert.throws(() => safePath(cwd, 'node_modules/example/index.js'));
});
test('custom argv checks support TypeScript and C without a language-specific agent', { skip: process.platform !== 'darwin' }, async t => {
  const d = temp(t); fs.writeFileSync(path.join(d, 'main.ts'), 'const value: number = 42; if (value !== 42) throw Error("bad"); console.log(value);');
  const ts = await runCheck([process.execPath, 'main.ts'], { cwd: d }); assert.equal(ts.ok, true, ts.output);
  fs.writeFileSync(path.join(d, 'main.c'), '#include <stdio.h>\nint main(void){ puts("42"); return 0; }\n');
  const compiled = await runCheck(['/usr/bin/cc', 'main.c', '-o', 'main'], { cwd: d }); assert.equal(compiled.ok, true, compiled.output);
  const executed = await runCheck(['./main'], { cwd: d }); assert.equal(executed.ok, true, executed.output); assert.match(executed.output, /42/);
});
test('complete harness edits isolated files, independently verifies and learns without touching source', async t => {
  const d = temp(t); fs.writeFileSync(path.join(d, 'value.cjs'), 'module.exports=0;');
  const config = configFor(d, { team: false, execution: 'trusted', checks: { test: [process.execPath, '-e', 'require("assert").equal(require("./value.cjs"),42)'] } });
  let i = 0;
  const runner = new Runner(config, { chat: async () => ++i === 1 ? answer('', [call('write_file', { path: 'value.cjs', content: 'module.exports=42;' })]) : answer('Implemented.') });
  const run = await runner.start('Return 42'); assert.equal(run.status, 'passed'); assert.equal(run.reward, 1); assert.equal(run.checks.at(-1).ok, true);
  assert.equal(fs.readFileSync(path.join(d, 'value.cjs'), 'utf8'), 'module.exports=0;'); assert.equal(new FlyBrain(config.dataDir).state.episodes, 1);
  assert.equal(run.changes[0].path, 'value.cjs'); assert.ok(run.events.some(e => e.type === 'packet'));
  assert.equal(run.events.find(e => e.type === 'packet').packet[2], 'h');
});
test('a claimed success without checks earns no reward and cannot train the controller', async t => {
  const d = temp(t), config = configFor(d, { team: false }); const runner = new Runner(config, { chat: async () => answer('All tests passed!') });
  const run = await runner.start('Explain this project'); assert.equal(run.status, 'unverified'); assert.equal(run.reward, null); assert.equal(new FlyBrain(config.dataDir).state.episodes, 0);
});
test('plan mode denies model write requests and existing test files stay protected', async t => {
  const d = temp(t); fs.writeFileSync(path.join(d, 'test_solution.py'), 'assert True'); const config = configFor(d, { team: false }); let i = 0;
  const runner = new Runner(config, { chat: async () => ++i === 1 ? answer('', [call('write_file', { path: 'test_solution.py', content: 'cheat' })]) : answer('done') });
  const run = await runner.start('Explore', { mode: 'plan' }); assert.equal(run.changes.length, 0); assert.match(run.events.find(e => e.type === 'tool_result').result.content, /unavailable/);
  i = 0; const run2 = await new Runner(config, { chat: async () => ++i === 1 ? answer('', [call('write_file', { path: 'test_solution.py', content: 'cheat' })]) : answer('done') }).start('Code');
  assert.equal(run2.changes.length, 0); assert.match(run2.events.find(e => e.type === 'tool_result').result.content, /protected/);
});
test('failed tests produce negative reward after bounded repairs; held-out runs do not learn', async t => {
  const d = temp(t), config = configFor(d, { team: false, execution: 'trusted', checks: { test: [process.execPath, '-e', 'process.exit(1)'] } });
  const run = await new Runner(config, { chat: async () => answer('done') }).start('Fix'); assert.equal(run.status, 'failed'); assert.equal(run.reward, -1); assert.equal(run.checks.length, 3);
  const before = fs.readFileSync(path.join(config.dataDir, 'brain.json'), 'utf8');
  await new Runner({ ...config, learning: false }, { chat: async () => answer('done') }).start('Evaluate');
  assert.equal(fs.readFileSync(path.join(config.dataDir, 'brain.json'), 'utf8'), before);
});
test('project lock rejects concurrent processes and releases cleanly', t => {
  const d = temp(t), release = acquire(d); assert.throws(() => acquire(d), /active/); release(); const release2 = acquire(d); release2();
});
test('HTTP rejects cross-origin mutation, missing token and private source paths', async t => {
  const d = temp(t); fs.writeFileSync(path.join(d, '.env'), 'secret'); const app = await startServer(configFor(d), { port: 0 }); t.after(() => app.close());
  const html = await (await fetch(app.url)).text(); const token = html.match(/name="flycoder-token" content="([^"]+)"/)[1];
  assert.equal((await fetch(app.url+'/api/run', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' })).status, 403);
  assert.equal((await fetch(app.url+'/api/stop', { method:'POST', headers:{'x-flycoder-token':token,origin:'https://evil.example'}, body:'{}' })).status, 403);
  assert.equal((await fetch(app.url+'/api/file?path=.env')).status, 400);
  assert.equal((await fetch(app.url+'/api/stop', { method:'POST', headers:{'x-flycoder-token':token}, body:'{}' })).status, 200);
  assert.equal((await fetch(app.url+'/api/run', { method:'POST', headers:{'x-flycoder-token':token}, body:'{"task":""}' })).status, 400);
  const status = await (await fetch(app.url+'/api/state')).json(); assert.equal(status.busy,false); assert.ok(status.brain.nodes.length>100);
});
test('Ollama receives the selected model, context budget and real tool schemas', async t => {
  let received;
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c; received = JSON.parse(body);
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ message: { role: 'assistant', content: 'ready' }, done: true, prompt_eval_count: 20, eval_count: 5, eval_duration: 1000000000 }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const config = configFor(temp(t), { host: `http://127.0.0.1:${server.address().port}`, numCtx: 8192 });
  const tools = [{ type: 'function', function: { name: 'read_file' } }]; const result = await model.chat(config, [{ role: 'user', content: 'hello' }], tools);
  assert.equal(received.model, 'flycoder0.1beta'); assert.equal(received.options.num_ctx, 8192); assert.deepEqual(received.tools, tools); assert.equal(result.metrics.tokensPerSecond, 5);
});
test('installer creates the native profile and seeds without overwriting learned weights', async t => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c; requests.push({ route: req.url, body: JSON.parse(raw) });
    res.setHeader('content-type', 'application/json'); res.end('{"status":"success"}\n');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const config = configFor(temp(t), { host: `http://127.0.0.1:${server.address().port}` });
  await model.install(config); const file = path.join(config.dataDir, 'brain.json'); assert.ok(fs.existsSync(file));
  assert.equal(requests[1].route, '/api/create'); assert.equal(requests[1].body.from, 'qwen3.5:4b'); assert.equal(requests[1].body.model, 'flycoder0.1beta');
  const before = fs.readFileSync(file, 'utf8'); await model.install(config); assert.equal(fs.readFileSync(file, 'utf8'), before);
});
