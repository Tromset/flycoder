'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Runner } = require('./runner.cjs');
const { atomicJSON } = require('./config.cjs');
// Fixed specifications and assertions are authored independently of generated code.
const CURRICULUM = [
  { id: 'js-sum', language: 'JavaScript', task: 'Implement sum(values) in solution.cjs. It returns the sum of a numeric array, with 0 for an empty array. Export it as module.exports = { sum }. Do not change the test.', file: 'solution.cjs', code: 'exports.sum = values => 0;\n', check: [process.execPath, '--test', 'solution.test.cjs'], testFile: 'solution.test.cjs', test: "const {test}=require('node:test');const a=require('node:assert/strict');const {sum}=require('./solution.cjs');test('sum',()=>{a.equal(sum([]),0);a.equal(sum([1,2,3]),6);a.equal(sum([-5,2]),-3);a.equal(sum([0.5,1.5]),2)});" },
  { id: 'py-unique', language: 'Python', task: 'Implement unique(values) in solution.py. Return distinct hashable elements in their original order. Empty input returns []. Do not change tests.', file: 'solution.py', code: 'def unique(values):\n    return values\n', check: ['/usr/bin/python3', 'test_solution.py'], testFile: 'test_solution.py', test: 'from solution import unique\nassert unique([])==[]\nassert unique([3,1,3,2,1])==[3,1,2]\nassert unique(["b","a","b"])==["b","a"]\nprint("3 assertions passed")\n' },
  { id: 'js-clamp', language: 'JavaScript', task: 'Implement clamp(n, low, high) in solution.cjs. Return n bounded inclusively by low/high. Throw RangeError if low > high. Export {clamp}. Do not change tests.', file: 'solution.cjs', code: 'exports.clamp = (n, low, high) => n;\n', check: [process.execPath, '--test', 'solution.test.cjs'], testFile: 'solution.test.cjs', test: "const {test}=require('node:test');const a=require('node:assert/strict');const {clamp}=require('./solution.cjs');test('bounds',()=>{a.equal(clamp(-2,0,5),0);a.equal(clamp(8,0,5),5);a.equal(clamp(2,0,5),2);a.equal(clamp(1,3,3),3);a.throws(()=>clamp(2,5,1),RangeError)});" },
  { id: 'py-palindrome', language: 'Python', task: 'Implement is_palindrome(text) in solution.py. Compare alphanumeric characters case-insensitively, ignoring whitespace and punctuation. Empty text is a palindrome. Do not change tests.', file: 'solution.py', code: 'def is_palindrome(text):\n    return False\n', check: ['/usr/bin/python3', 'test_solution.py'], testFile: 'test_solution.py', test: 'from solution import is_palindrome\nassert is_palindrome("")\nassert is_palindrome("A man, a plan, a canal: Panama!")\nassert not is_palindrome("flycoder")\nassert is_palindrome("121")\nprint("4 assertions passed")\n' },
  { id: 'js-factorial', split: 'holdout', language: 'JavaScript', task: 'Implement factorial(n) in solution.cjs for nonnegative integers. 0 returns 1. Throw RangeError for negative or fractional n. Export {factorial}. Do not change tests.', file: 'solution.cjs', code: 'exports.factorial = n => n;\n', check: [process.execPath, '--test', 'solution.test.cjs'], testFile: 'solution.test.cjs', test: "const {test}=require('node:test');const a=require('node:assert/strict');const {factorial}=require('./solution.cjs');test('factorial',()=>{a.equal(factorial(0),1);a.equal(factorial(5),120);a.equal(factorial(1),1);a.throws(()=>factorial(-1),RangeError);a.throws(()=>factorial(2.5),RangeError)});" },
  { id: 'py-chunks', split: 'holdout', language: 'Python', task: 'Implement chunks(values, size) in solution.py. Return a list of consecutive slices of length size, allowing a shorter final slice. Raise ValueError if size <= 0. Empty input returns []. Do not change tests.', file: 'solution.py', code: 'def chunks(values, size):\n    return []\n', check: ['/usr/bin/python3', 'test_solution.py'], testFile: 'test_solution.py', test: 'from solution import chunks\nassert chunks([],2)==[]\nassert chunks([1,2,3,4,5],2)==[[1,2],[3,4],[5]]\nassert chunks([1],4)==[[1]]\ntry:\n    chunks([1],0)\n    raise AssertionError("must reject zero")\nexcept ValueError:\n    pass\nprint("4 assertions passed")\n' }
];
async function train(config, { evaluate = false, onEvent = () => {}, signal } = {}) {
  const tasks = CURRICULUM.filter(t => evaluate ? t.split === 'holdout' : !t.split);
  const session = Date.now().toString(); const results = [];
  for (const task of tasks) {
    if (signal?.aborted) break;
    const workspace = path.join(config.dataDir, 'curriculum', session, task.id); fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(path.join(workspace, task.file), task.code); fs.writeFileSync(path.join(workspace, task.testFile), task.test);
    // Evaluation uses a checkpoint copy so held-out rewards cannot train production policy.
    const dataDir = evaluate ? path.join(config.dataDir, 'evaluation', session) : config.dataDir;
    if (evaluate && !fs.existsSync(path.join(dataDir, 'brain.json')) && fs.existsSync(path.join(config.dataDir, 'brain.json'))) {
      fs.mkdirSync(dataDir, { recursive: true }); fs.copyFileSync(path.join(config.dataDir, 'brain.json'), path.join(dataDir, 'brain.json'));
    }
    const runner = new Runner({ ...config, workspace, dataDir, checks: { test: task.check }, learning: !evaluate, team: false, maxTurns: 10 }, { onEvent });
    const abort = () => runner.abort(); signal?.addEventListener('abort', abort, { once: true });
    let run; try { run = await runner.start(task.task, { explore: !evaluate }); } finally { signal?.removeEventListener('abort', abort); }
    results.push({ task: task.id, language: task.language, runId: run.id, status: run.status, reward: run.reward, strategy: run.decision.name,
      durationMs: Date.parse(run.finishedAt) - Date.parse(run.startedAt), metrics: run.events.filter(e => e.type === 'metrics').map(e => ({ durationMs: e.durationMs, promptTokens: e.promptTokens, outputTokens: e.outputTokens })) });
    onEvent({ type: 'training_progress', completed: results.length, total: tasks.length, result: results.at(-1) });
  }
  const report = { at: new Date().toISOString(), split: evaluate ? 'holdout' : 'training', model: config.model, results,
    passed: results.filter(r => r.status === 'passed').length, total: tasks.length, scope: 'Small curriculum; no SWE benchmark or speedup claim. Only controller weights train, not Qwen.' };
  atomicJSON(path.join(config.dataDir, evaluate ? 'evaluation.json' : 'training.json'), report); return report;
}
module.exports = { CURRICULUM, train };
