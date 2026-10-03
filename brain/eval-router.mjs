#!/usr/bin/env node
// Measures how well FlyBrain routes labelled prompts: rules alone, then rules + micro-model.
// Usage: node brain/eval-router.mjs [--ollama http://127.0.0.1:11434] [--router flycoder:router]
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { digest, ruleRoute } from './router.mjs';
import { PROBLEMS } from '../bench/problems.mjs';
import { instruction } from '../bench/bench.mjs';

const { values } = parseArgs({ options: { ollama: { type: 'string', default: 'http://127.0.0.1:11434' }, router: { type: 'string', default: 'flycoder:router' } } });
const labelled = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/route-prompts.json', import.meta.url), 'utf8'));
const cases = [...labelled.simple.map(text => ({ text, want: 'simple' })), ...labelled.hard.map(text => ({ text, want: 'hard' })),
  ...PROBLEMS.map(p => ({ text: instruction(p), want: 'hard' }))];

async function ask(text) {
  const started = Date.now();
  const response = await fetch(values.ollama.replace(/\/$/, '') + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: values.router, stream: false, think: false, messages: [{ role: 'user', content: text.slice(0, 2000) }],
      format: { type: 'object', properties: { level: { type: 'string', enum: ['simple', 'hard'] } }, required: ['level'] }, options: { temperature: 0, num_predict: 16 } }) });
  const data = await response.json();
  return { level: JSON.parse(data.message?.content || '{}').level, ms: Date.now() - started };
}

const rows = [];
for (const c of cases) {
  const rule = ruleRoute(digest({ messages: [{ role: 'user', content: c.text }] }));
  const model = rule.level === 'unsure' ? await ask(c.text).catch(e => ({ level: 'hard', error: e.message })) : null;
  rows.push({ ...c, rule: rule.level, final: model ? (model.level === 'simple' ? 'simple' : 'hard') : rule.level, modelMs: model?.ms });
}
const count = f => rows.filter(f).length;
const decided = rows.filter(r => r.rule !== 'unsure');
console.log(`Cases: ${rows.length} (${count(r => r.want === 'simple')} simple, ${count(r => r.want === 'hard')} hard)`);
console.log(`Rules alone: ${decided.length} decided, ${count(r => r.rule !== 'unsure' && r.rule === r.want)} correct, ${count(r => r.rule === 'unsure')} handed to the micro-model`);
console.log(`Rules + micro-model: ${count(r => r.final === r.want)}/${rows.length} correct`);
console.log(`  hard sent to the small expert (quality loss): ${count(r => r.want === 'hard' && r.final === 'simple')}`);
console.log(`  simple sent to the large expert (extra time and RAM): ${count(r => r.want === 'simple' && r.final === 'hard')}`);
const times = rows.filter(r => r.modelMs).map(r => r.modelMs).sort((a, b) => a - b);
if (times.length) console.log(`Micro-model: median ${times[Math.floor(times.length / 2)]} ms over ${times.length} calls`);
for (const r of rows.filter(r => r.final !== r.want)) console.log(`  ✗ wanted ${r.want}, got ${r.final} (${r.rule}): ${r.text.slice(0, 90).replace(/\n/g, ' ')}`);
