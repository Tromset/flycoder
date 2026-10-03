import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { digest, ruleRoute, route, profiles, Memory } from '../brain/router.mjs';
import { createFlyBrain, Scheduler, defaultMaxExpert } from '../brain/flybrain.mjs';
import { PROBLEMS } from '../bench/problems.mjs';
import { instruction } from '../bench/bench.mjs';

const user = content => ({ messages: [{ role: 'user', content }] });
const level = body => ruleRoute(digest(body)).level;

test('rules send every bench problem to the hard expert', () => {
  for (const p of PROBLEMS) assert.equal(level(user(instruction(p))), 'hard', p.id);
});

test('rules: short questions are simple, agents and long or detailed requests are hard', () => {
  for (const q of ["Qu'est-ce qu'une closure en JavaScript ?", 'How do I reverse a list in Python?', 'Explique la différence entre let et const.'])
    assert.equal(level(user(q)), 'simple', q);
  assert.equal(level({ ...user('salut'), tools: [{ type: 'function', function: { name: 'read' } }] }), 'hard');
  assert.equal(level(user('x'.repeat(7000))), 'hard');
  assert.equal(level(user('Pourquoi ce code plante ?\n```py\na()\n```\n```\nTraceback\n```')), 'hard');
  assert.equal(level(user('Débogue cette fonction')), 'hard');
  assert.equal(level(user('Écris une fonction qui met une chaîne en majuscules')), 'unsure');
});

test('digest reads native, OpenAI and Anthropic shapes', () => {
  assert.equal(digest({ prompt: 'hello' }).last, 'hello');
  assert.equal(digest({ messages: [{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'image_url' }] }] }).last, 'a\n');
  const anthropic = digest({ system: [{ type: 'text', text: 'sys' }], messages: [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: [{ type: 'tool_result', content: 'out' }] }] });
  assert.deepEqual([anthropic.first, anthropic.last, anthropic.turns], ['first', 'out', 2]);
});

test('route: the micro-model settles unclear requests, and any failure keeps quality', async () => {
  const profile = profiles().flycoder, body = user('Écris une fonction qui met une chaîne en majuscules');
  assert.equal((await route('flycoder', body, { profile, askRouter: async () => 'simple' })).expert, 'flycoder:0.2-beta-fast');
  assert.equal((await route('flycoder', body, { profile, askRouter: async () => 'hard' })).expert, 'flycoder:0.2-beta');
  assert.equal((await route('flycoder', body, { profile, askRouter: async () => 'maybe' })).level, 'hard');
  assert.equal((await route('flycoder', body, { profile, askRouter: async () => { throw new Error('down'); } })).level, 'hard');
  // No micro-model call when the hard expert is already in memory.
  const skipped = await route('flycoder', body, { profile, loaded: profile.hard, askRouter: () => assert.fail('router called') });
  assert.equal(skipped.reason, 'hard expert already loaded');
  // flycoder:fast has no micro-model: unclear requests keep the 4B.
  assert.equal((await route('flycoder:fast', body, { profile: profiles()['flycoder:fast'] })).expert, 'flycoder:0.2-beta-fast');
});

test('route: a conversation keeps its expert and can only move up', async () => {
  const profile = profiles().flycoder, memory = new Memory();
  const first = [{ role: 'user', content: 'Explique les closures.' }];
  assert.equal((await route('flycoder', { messages: first }, { profile, memory })).level, 'simple');
  const turn2 = [...first, { role: 'assistant', content: '...' }, { role: 'user', content: 'Et avec un exemple ?' }];
  assert.equal((await route('flycoder', { messages: turn2 }, { profile, memory, askRouter: () => assert.fail('router called') })).level, 'simple');
  const turn3 = [...turn2, { role: 'assistant', content: '...' }, { role: 'user', content: 'Débogue ce code maintenant.' }];
  assert.equal((await route('flycoder', { messages: turn3 }, { profile, memory })).level, 'hard');
  const turn4 = [...turn3, { role: 'assistant', content: '...' }, { role: 'user', content: 'Merci, et pourquoi ?' }];
  assert.equal((await route('flycoder', { messages: turn4 }, { profile, memory })).level, 'hard');
});

test('profiles: prefix for published models and the 8 GB cap', () => {
  assert.equal(profiles('Tromset/').flycoder.hard, 'Tromset/flycoder:0.2-beta');
  assert.equal(profiles('', { maxExpert: 'fast' }).flycoder.hard, 'flycoder:0.2-beta-fast');
  assert.equal(defaultMaxExpert(8 * 2 ** 30), 'fast');
  assert.equal(defaultMaxExpert(16 * 2 ** 30), 'full');
});

test('scheduler: a different expert waits for running requests, then the old one is unloaded', async () => {
  const unloaded = [], order = [];
  const s = new Scheduler(async m => { unloaded.push(m); });
  const tick = () => new Promise(r => setTimeout(r, 10));
  const releaseA = await s.acquire('a');
  const b = s.acquire('b').then(release => { order.push('b'); return release; });
  // Fairness: a later request for the loaded expert queues behind the waiting one.
  const a2 = s.acquire('a').then(release => { order.push('a2'); return release; });
  await tick();
  assert.deepEqual(order, []);
  releaseA(); await tick();
  assert.deepEqual(order, ['b']);
  assert.equal(s.current, 'b');
  (await b)(); await tick();
  assert.deepEqual(order, ['b', 'a2']);
  (await a2)();
  assert.deepEqual(unloaded, ['a', 'b']);
});

// A fake Ollama that records requests and the models it holds in memory.
async function fakeOllama() {
  const seen = [], loaded = new Set();
  let maxLoaded = 0;
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    seen.push({ path: req.url, ...body });
    if (body.keep_alive === 0) { loaded.delete(body.model); return res.end('{}'); }
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [] }));
    if (req.url === '/api/show') return res.end(JSON.stringify({ model: body.model }));
    loaded.add(body.model); maxLoaded = Math.max(maxLoaded, [...loaded].filter(m => !m.endsWith('router')).length);
    if (body.model.endsWith('router')) return res.end(JSON.stringify({ message: { content: '{"level":"simple"}' }, done: true }));
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(JSON.stringify({ model: body.model, message: { content: 'hi' }, done: false }) + '\n');
    res.end(JSON.stringify({ model: body.model, done: true }) + '\n');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, loaded, maxLoaded: () => maxLoaded, close: () => server.close() };
}

test('FlyBrain server rewrites the model, streams the answer and keeps one expert loaded', async () => {
  const ollama = await fakeOllama();
  const brain = createFlyBrain({ ollama: ollama.url, log: () => {} });
  await new Promise(r => brain.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${brain.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const simple = await post('/api/chat', { model: 'flycoder', ...user('How do I reverse a list in Python?') });
    assert.equal(simple.headers.get('x-flybrain-expert'), 'flycoder:0.2-beta-fast');
    assert.match(await simple.text(), /"done":true/);
    assert.equal(ollama.seen.at(-1).think, true, 'normal profile thinks by default');

    const unclear = await post('/v1/chat/completions', { model: 'flycoder', messages: [{ role: 'user', content: 'Écris une fonction qui met une chaîne en majuscules' }] });
    assert.equal(unclear.headers.get('x-flybrain-reason'), 'simple: micro-model');
    await unclear.text();

    const hard = await post('/v1/messages', { model: 'flycoder', max_tokens: 10, tools: [{ name: 'read', input_schema: {} }], messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(hard.headers.get('x-flybrain-expert'), 'flycoder:0.2-beta');
    await hard.text();
    assert.deepEqual([...ollama.loaded], ['flycoder:0.2-beta'], 'small expert and micro-model unloaded before the 12B');
    assert.equal(ollama.maxLoaded(), 1);

    const show = await post('/api/show', { model: 'flycoder:fast' });
    assert.equal((await show.json()).model, 'flycoder:0.2-beta-fast');
    const other = await post('/api/chat', { model: 'llama3', ...user('hi') });
    assert.equal(other.headers.get('x-flybrain-expert'), null);
    await other.text();
    assert.equal(ollama.seen.at(-1).model, 'llama3', 'other models pass through untouched');
    assert.equal((await fetch(base + '/api/tags')).status, 200);
  } finally { brain.close(); ollama.close(); }
});
