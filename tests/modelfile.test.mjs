import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Minimal Modelfile reader: FROM, REQUIRES, PARAMETER, and the triple-quoted SYSTEM and MESSAGE blocks.
function parse(text) {
  const system = text.match(/^SYSTEM """([\s\S]*?)"""/m)?.[1];
  const messages = [...text.matchAll(/^MESSAGE (user|assistant) """([\s\S]*?)"""/gm)].map(m => ({ role: m[1], content: m[2] }));
  const lines = text.replace(/^(SYSTEM|MESSAGE \w+) """[\s\S]*?"""/gm, '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const from = lines.filter(l => /^FROM /i.test(l)).map(l => l.slice(5).trim());
  const requires = lines.filter(l => /^REQUIRES /i.test(l)).map(l => l.slice(9).trim());
  const params = Object.fromEntries(lines.filter(l => /^PARAMETER /i.test(l)).map(l => l.split(/\s+/).slice(1)));
  const unknown = lines.filter(l => !/^(FROM|REQUIRES|PARAMETER) /i.test(l));
  return { from, requires, params, system, messages, unknown };
}

const QWEN = { temperature: '0.6', top_k: '20', top_p: '0.95', min_p: '0', presence_penalty: '0', repeat_penalty: '1' };
// page: the Ollama page of the model; size and mac are what that page must say.
const VARIANTS = [
  { file: 'Modelfile', name: 'flycoder0.3', gguf: 'qwen3.5:9b', mlx: 'qwen3.5:9b-mtp-nvfp4', base: 'Qwen3.5 9B by the Qwen team at Alibaba',
    params: { num_ctx: '65536', ...QWEN }, page: 'docs/ollama/flycoder0.3.md', size: '6.6 GB', mac: '16 GB', ctx: '64K' },
  { file: 'Modelfile.fast', name: 'flycoder0.3fast', gguf: 'qwen3.5:4b', mlx: 'qwen3.5:4b-nvfp4', base: 'Qwen3.5 4B by the Qwen team at Alibaba',
    params: { num_ctx: '32768', ...QWEN }, page: 'docs/ollama/flycoder0.3fast.md', size: '3.3 GB', mac: '8 GB', ctx: '32K' },
  { file: 'Modelfile.pro', name: 'flycoder0.3pro', gguf: 'qwen3.8:27b', mlx: 'qwen3.8:27b-nvfp4', base: 'Qwen3.8 27B by the Qwen team at Alibaba',
    params: { num_ctx: '65536', ...QWEN, draft_num_predict: '4' }, requires: '0.32.12', page: 'docs/ollama/flycoder0.3pro.md', size: '18 GB', mac: '32 GB', ctx: '64K' },
  { file: 'Modelfile.lite', name: 'flycoder0.3:lite', gguf: 'qwen3.5:2b', mlx: 'qwen3.5:2b-nvfp4', base: 'Qwen3.5 2B by the Qwen team at Alibaba',
    params: { num_ctx: '8192', ...QWEN } }
];
const ROUTER = { file: 'Modelfile.router', name: 'flycoder0.3:router', gguf: 'qwen3.5:0.8b', mlx: 'qwen3.5:0.8b-nvfp4', params: { num_ctx: '2048', temperature: '0' } };
const KNOWN = new Set(['num_ctx', 'temperature', 'top_k', 'top_p', 'min_p', 'presence_penalty', 'repeat_penalty', 'repeat_last_n', 'seed', 'stop', 'num_predict', 'draft_num_predict']);

for (const v of VARIANTS) {
  test(`${v.file} builds ${v.name} from ${v.gguf} with the recommended sampling`, () => {
    const m = parse(read(v.file));
    assert.deepEqual(m.from, [v.gguf]);
    assert.deepEqual(m.requires, [v.requires ?? '0.30.0'], 'Ollama names the version to install instead of failing to load');
    assert.deepEqual(m.unknown, []);
    assert.deepEqual(m.params, v.params);
    for (const key of Object.keys(m.params)) assert.ok(KNOWN.has(key), `unknown parameter ${key}`);
    assert.ok(m.system.includes(v.base), 'system prompt names the real base model');
  });
}

const PRO = VARIANTS.find(v => v.name === 'flycoder0.3pro');
const SHARED = VARIANTS.filter(v => v !== PRO);

test('the 0.3, fast and lite experts share one system prompt, apart from the base model sentence', () => {
  const [a, ...others] = SHARED.map(v => parse(read(v.file)).system.replace(v.base, '<base>'));
  for (const b of others) assert.equal(b, a);
  assert.match(a, /^You are FlyCoder 0\.3,/);
  assert.ok(a.length < 2500, 'keep the system prompt short: it is processed on every new conversation');
  for (const v of SHARED) assert.deepEqual(parse(read(v.file)).messages, [], `${v.file} has no example conversation`);
});

test('flycoder0.3pro keeps every shared rule and adds the agent rules', () => {
  // Measured on the 9B base: the shared prompt solved 9/20 bench problems, a six-step workflow with a worked example 6/20.
  const shared = parse(read('Modelfile')).system;
  const m = parse(read(PRO.file));
  assert.match(m.system, /^You are FlyCoder 0\.3 pro,/);
  assert.ok(m.system.includes(PRO.base), 'pro prompt names the real base model');
  const rules = shared.split('\n').filter(l => l.startsWith('- ') && !l.startsWith('- Never claim'));
  assert.ok(rules.length >= 8);
  for (const rule of rules) assert.ok(m.system.includes(rule), `pro prompt keeps: ${rule}`);
  assert.match(m.system, /Never claim that you ran code or tests unless a tool actually ran them/);
  assert.match(m.system, /As an agent with tools: read the relevant files before editing them/);
  assert.match(m.system, /Never run a destructive command/);
  assert.deepEqual(m.messages, [], 'no example conversation: it cost quality in the A/B bench');
  assert.ok(m.system.length < 3000, 'keep the pro prompt short');
});

test('installer and publisher agree with the Modelfiles and the package version', () => {
  const install = read('install.sh'), publish = read('scripts/publish.sh'), pkg = JSON.parse(read('package.json'));
  assert.match(pkg.version, /^0\.3\.\d+$/);
  for (const script of [install, publish]) assert.match(script, /^VERSION=0\.3$/m);
  for (const v of [...VARIANTS, ROUTER]) {
    assert.ok(install.includes(`build ${v.file} ${v.name} ${v.gguf} ${v.mlx}`), `install.sh builds ${v.name} from ${v.file}`);
    assert.match(publish, new RegExp(`^(MODELS=')?${v.file.replace('.', '\\.')} ${v.name}'?$`, 'm'), `publish.sh publishes ${v.file} as ${v.name}`);
  }
  for (const file of ['brain/router.mjs', 'brain/flybrain.mjs']) assert.ok(install.includes(file), `install.sh installs ${file}`);
});

test('every published model has a short, up-to-date Ollama page', () => {
  for (const v of VARIANTS.filter(v => v.page)) {
    const page = read(v.page);
    assert.ok(page.includes(`ollama run Tromset/${v.name}\n`), `${v.page} shows how to run Tromset/${v.name}`);
    for (const fact of [v.size, v.mac, v.ctx, v.base.split(' by ')[0]]) assert.ok(page.includes(fact), `${v.page} mentions ${fact}`);
    assert.ok(!/0\.2|Gemma/.test(page), `${v.page} has no stale 0.2 or Gemma mention`);
    assert.ok(page.split('\n').length <= 40, `${v.page} stays short`);
  }
});

test('the publish workflow runs the publisher and updates every page', () => {
  const workflow = read('.github/workflows/publish-ollama.yml');
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /sh scripts\/publish\.sh Tromset/);
  for (const v of VARIANTS.filter(v => v.page)) assert.ok(workflow.includes(v.page.split('/').pop()) || workflow.includes('docs/ollama/'), `workflow uploads ${v.page}`);
  for (const secret of ['OLLAMA_KEY', 'OLLAMA_API_KEY']) assert.ok(workflow.includes(`secrets.${secret}`), `workflow uses ${secret}`);
});

test('shell scripts parse with POSIX sh', () => {
  for (const file of ['install.sh', 'scripts/publish.sh', 'scripts/update-ollama-pages.sh']) execFileSync('sh', ['-n', new URL(`../${file}`, import.meta.url).pathname]);
});
