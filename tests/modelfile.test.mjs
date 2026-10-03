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

const VARIANTS = [
  { file: 'Modelfile', tag: '0.2-beta', mlx: 'gemma4:12b-mlx', gguf: 'gemma4:12b', base: 'Gemma 4 12B by Google DeepMind', params: { num_ctx: '32768', temperature: '1', top_k: '64', top_p: '0.95' } },
  { file: 'Modelfile.fast', tag: '0.2-beta-fast', mlx: 'qwen3.5:4b-mlx', gguf: 'qwen3.5:4b', base: 'Qwen3.5 4B by the Qwen team at Alibaba',
    params: { num_ctx: '16384', temperature: '0.6', top_k: '20', top_p: '0.95', min_p: '0', presence_penalty: '0', repeat_penalty: '1' } }
];
const KNOWN = new Set(['num_ctx', 'temperature', 'top_k', 'top_p', 'min_p', 'presence_penalty', 'repeat_penalty', 'repeat_last_n', 'seed', 'stop', 'num_predict', 'draft_num_predict']);

for (const v of VARIANTS) {
  test(`${v.file} builds ${v.tag} from ${v.mlx} with the recommended sampling`, () => {
    const m = parse(read(v.file));
    assert.deepEqual(m.from, [v.mlx]);
    assert.deepEqual(m.unknown, []);
    assert.deepEqual(m.params, v.params);
    for (const key of Object.keys(m.params)) assert.ok(KNOWN.has(key), `unknown parameter ${key}`);
    assert.ok(m.system.includes(v.base), 'system prompt names the real base model');
  });
}

test('both variants share one system prompt, apart from the base model sentence', () => {
  const [a, b] = VARIANTS.map(v => parse(read(v.file)).system.replace(v.base, '<base>'));
  assert.equal(a, b);
  assert.match(a, /^You are FlyCoder 0\.2 beta/);
  assert.ok(a.length < 2500, 'keep the system prompt short: it is processed on every new conversation');
});

test('installer and publisher agree with the Modelfiles and the package version', () => {
  const install = read('install.sh'), publish = read('scripts/publish.sh'), pkg = JSON.parse(read('package.json'));
  assert.match(pkg.version, /^0\.2\.0-beta\./);
  for (const script of [install, publish]) assert.match(script, /^VERSION=0\.2-beta$/m);
  for (const v of VARIANTS) {
    assert.ok(install.includes(`build ${v.file} "$VERSION${v.tag.slice('0.2-beta'.length)}" ${v.mlx} ${v.gguf}`), `install.sh builds ${v.file}`);
    assert.ok(publish.includes(`FROM ${v.mlx}$|FROM ${v.gguf}`), `publish.sh maps ${v.mlx} to ${v.gguf}`);
  }
});

test('shell scripts parse with POSIX sh', () => {
  for (const file of ['install.sh', 'scripts/publish.sh']) execFileSync('sh', ['-n', new URL(`../${file}`, import.meta.url).pathname]);
});
