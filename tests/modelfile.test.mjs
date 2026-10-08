import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Minimal Modelfile reader: FROM, PARAMETER and the triple-quoted SYSTEM block.
function parse(text) {
  const system = text.match(/^SYSTEM """([\s\S]*?)"""/m)?.[1];
  const lines = text.replace(/^SYSTEM """[\s\S]*?"""/m, '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const from = lines.filter(l => /^FROM /i.test(l)).map(l => l.slice(5).trim());
  const params = Object.fromEntries(lines.filter(l => /^PARAMETER /i.test(l)).map(l => l.split(/\s+/).slice(1)));
  const unknown = lines.filter(l => !/^(FROM|PARAMETER) /i.test(l));
  return { from, params, system, unknown };
}

const QWEN = { temperature: '0.6', top_k: '20', top_p: '0.95', min_p: '0', presence_penalty: '0', repeat_penalty: '1' };
// page: the Ollama page of the model; size and mac are what that page must say.
const VARIANTS = [
  { file: 'Modelfile', name: 'flycoder0.3', gguf: 'qwen3.5:9b', mlx: 'qwen3.5:9b-mtp-nvfp4', base: 'Qwen3.5 9B by the Qwen team at Alibaba',
    params: { num_ctx: '65536', ...QWEN }, page: 'docs/ollama/flycoder0.3.md', size: '6.6 GB', mac: '16 GB', ctx: '64K' },
  { file: 'Modelfile.fast', name: 'flycoder0.3fast', gguf: 'qwen3.5:4b', mlx: 'qwen3.5:4b-nvfp4', base: 'Qwen3.5 4B by the Qwen team at Alibaba',
    params: { num_ctx: '32768', ...QWEN }, page: 'docs/ollama/flycoder0.3fast.md', size: '3.3 GB', mac: '8 GB', ctx: '32K' },
  { file: 'Modelfile.pro', name: 'flycoder0.3pro', gguf: 'qwen3.8:27b', mlx: 'qwen3.8:27b-nvfp4', base: 'Qwen3.8 27B by the Qwen team at Alibaba',
    params: { num_ctx: '65536', ...QWEN }, page: 'docs/ollama/flycoder0.3pro.md', size: '18 GB', mac: '32 GB', ctx: '64K' },
  { file: 'Modelfile.lite', name: 'flycoder0.3:lite', gguf: 'qwen3.5:2b', mlx: 'qwen3.5:2b-nvfp4', base: 'Qwen3.5 2B by the Qwen team at Alibaba',
    params: { num_ctx: '8192', ...QWEN } }
];
const ROUTER = { file: 'Modelfile.router', name: 'flycoder0.3:router', gguf: 'qwen3.5:0.8b', mlx: 'qwen3.5:0.8b-nvfp4', params: { num_ctx: '2048', temperature: '0' } };
const KNOWN = new Set(['num_ctx', 'temperature', 'top_k', 'top_p', 'min_p', 'presence_penalty', 'repeat_penalty', 'repeat_last_n', 'seed', 'stop', 'num_predict', 'draft_num_predict']);

for (const v of VARIANTS) {
  test(`${v.file} builds ${v.name} from ${v.gguf} with the recommended sampling`, () => {
    const m = parse(read(v.file));
    assert.deepEqual(m.from, [v.gguf]);
    assert.deepEqual(m.unknown, []);
    assert.deepEqual(m.params, v.params);
    for (const key of Object.keys(m.params)) assert.ok(KNOWN.has(key), `unknown parameter ${key}`);
    assert.ok(m.system.includes(v.base), 'system prompt names the real base model');
  });
}

test('every expert shares one system prompt, apart from the base model sentence', () => {
  const [a, ...others] = VARIANTS.map(v => parse(read(v.file)).system.replace(v.base, '<base>'));
  for (const b of others) assert.equal(b, a);
  assert.match(a, /^You are FlyCoder 0\.3,/);
  assert.ok(a.length < 2500, 'keep the system prompt short: it is processed on every new conversation');
});

test('Modelfile.router is a tiny deterministic classifier that answers simple or hard', () => {
  const m = parse(read(ROUTER.file));
  assert.deepEqual(m.from, [ROUTER.gguf]);
  assert.deepEqual(m.unknown, []);
  assert.deepEqual(m.params, ROUTER.params);
  assert.match(m.system, /"simple"/); assert.match(m.system, /"hard"/);
  assert.match(m.system, /When unsure, answer "hard"/);
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
