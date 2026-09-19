#!/usr/bin/env node
'use strict';
// Qualitative probes of the complete pipeline; inspect the generated answers.
// This deliberately does not equate token loss with semantic accuracy.
const fs = require('node:fs');
const path = require('node:path');
const { buildMessages, buildDialogueMessages } = require('../server/fly-language');
const root = path.join(__dirname, '../data/fly-language');
const model = process.env.FLY_LLM_MODEL || 'mlx-community/Qwen2.5-1.5B-Instruct-4bit';
const dialogueModel = process.env.FLY_DIALOGUE_MODEL || 'mlx-community/Qwen2.5-7B-Instruct-4bit';
const endpoint = (process.env.FLY_LLM_BASE_URL || 'http://127.0.0.1:8081/v1') + '/chat/completions';

async function generate(body) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000), body: JSON.stringify({ ...body, max_tokens: 180, temperature: 0, stream: false }) });
  if (!response.ok) throw new Error('Qwen HTTP ' + response.status);
  const data = await response.json();
  const text = data.choices && data.choices[0] && data.choices[0].message.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Empty model response');
  return text;
}
async function main() {
  const cases = JSON.parse(fs.readFileSync(path.join(root, 'dataset/evaluation.json')));
  const results = [];
  for (const index of [0, 2, 4, 5, 6, 7, 10, 11]) {
    const c = cases[index];
    const draft = await generate({ model, adapters: process.env.FLY_LLM_ADAPTER_PATH || path.join(root, 'best'),
      messages: buildMessages(c.state, 'À quoi penses-tu ?') });
    const actual = await generate({ model: dialogueModel, messages: buildDialogueMessages(c.state, c.question, [], draft) });
    results.push({ ...c, draft, actual });
    console.log(JSON.stringify({ question: c.question, actual }));
  }
  fs.writeFileSync(path.join(root, 'dialogue-evaluation.json'), JSON.stringify(results, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
