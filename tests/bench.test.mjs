import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROBLEMS } from '../bench/problems.mjs';
import { extractCode, runTest, summarize, instruction } from '../bench/bench.mjs';

test('problem ids are unique and every problem is complete', () => {
  assert.equal(new Set(PROBLEMS.map(p => p.id)).size, PROBLEMS.length);
  for (const p of PROBLEMS) {
    assert.ok(['python', 'javascript'].includes(p.language), p.id);
    for (const key of ['prompt', 'entry', 'reference', 'test']) assert.ok(typeof p[key] === 'string' && p[key].trim(), `${p.id}.${key}`);
    assert.ok(!instruction(p).includes(p.reference.trim().slice(0, 40)), `${p.id} leaks its reference into the prompt`);
  }
});

for (const p of PROBLEMS) {
  test(`${p.id}: the reference solution passes the hidden test`, async () => {
    const result = await runTest(p, p.reference);
    assert.equal(result.ok, true, result.output);
  });
  test(`${p.id}: a stub solution fails the hidden test`, async () => {
    const stub = p.language === 'python'
      ? `class ${p.entry}:\n    def __init__(self, *a, **k):\n        pass\n    def __call__(self, *a, **k):\n        return None\n    def get(self, *a):\n        return None\n    def put(self, *a):\n        return None\n`
      : `export function ${p.entry}() { return undefined; }\n`;
    const result = await runTest(p, stub);
    assert.equal(result.ok, false, `${p.id} accepts a stub`);
  });
}

test('extractCode keeps the defining block in the expected language', () => {
  const answer = 'Here:\n```bash\npip install x\n```\n```python\ndef helper():\n    pass\n```\n```python\ndef target(x):\n    return x\n```\nDone.';
  assert.equal(extractCode(answer, 'python', 'target'), 'def target(x):\n    return x\n');
  assert.equal(extractCode('def target():\n    return 1', 'python', 'target'), 'def target():\n    return 1\n');
  assert.match(extractCode('```js\nfunction target() { return 1; }\n```', 'javascript', 'target'), /export \{ target \}/);
  assert.doesNotMatch(extractCode('```js\nexport const target = () => 1;\n```', 'javascript', 'target'), /export \{/);
});

test('summary reports pass rate and decode speed from Ollama counters', () => {
  const s = summarize('m', [{ ok: true, outputTokens: 100, decodeMs: 2000, promptTokens: 50, prefillMs: 100, wallMs: 3000, loadMs: 500 }, { ok: false, outputTokens: 100, decodeMs: 2000, wallMs: 2000 }]);
  assert.equal(s.passed, 1); assert.equal(s.passRate, 0.5); assert.equal(s.decodeTokensPerSecond, 50); assert.equal(s.prefillTokensPerSecond, 500); assert.equal(s.meanSecondsPerProblem, 2.25);
});

test('a hanging solution is killed by the timeout', async () => {
  const p = PROBLEMS.find(x => x.language === 'python');
  const result = await runTest(p, `import time\ndef ${p.entry}(*a):\n    time.sleep(60)\n${p.entry}()\n`, { timeoutMs: 500 });
  assert.equal(result.ok, false); assert.equal(result.timedOut, true);
});
