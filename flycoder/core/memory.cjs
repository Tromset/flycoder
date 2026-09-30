'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { features } = require('./brain.cjs');
const { readJSON, atomicJSON } = require('./config.cjs');
class Memory {
  constructor(dataDir) { this.file = path.join(dataDir, 'memory.json'); this.entries = readJSON(this.file, []); }
  recall(query, limit = 3) {
    const x = features(query);
    return this.entries.filter(e => e.reward > 0).map(e => ({ ...e, score: e.features.reduce((s, v, i) => s + v * x[i], 0) }))
      .filter(e => e.score > 0.15).sort((a, b) => b.score - a.score).slice(0, limit)
      .map(({ task, lesson, reward, runId }) => ({ task, lesson, reward, runId }));
  }
  add(entry) { this.entries.push({ ...entry, features: features(entry.task) }); this.entries = this.entries.slice(-500); atomicJSON(this.file, this.entries); }
}
// Budget in UTF-8 bytes is deliberately conservative, not advertised as exact tokens.
// Keep the system, original task, and complete assistant/tool groups. Archive is on disk.
function compact(messages, numCtx) {
  const budget = Math.max(2048, numCtx - 3072);
  const bytes = m => Buffer.byteLength(JSON.stringify(m));
  const before = bytes(messages);
  if (before <= budget) return { messages, before, after: before, compacted: false };
  const head = messages.slice(0, 2);
  const groups = [];
  for (const msg of messages.slice(2)) {
    if (msg.role !== 'tool' || !groups.length) groups.push([]);
    groups.at(-1).push(msg);
  }
  const kept = []; let size = bytes(head) + 400;
  for (const group of groups.reverse()) { if (size + bytes(group) > budget) break; kept.unshift(...group); size += bytes(group); }
  const result = [...head, { role: 'user', content: 'Earlier tool exchanges were archived. Re-read files as needed; do not assume a previous check is current.' }, ...kept];
  if (bytes(result) > budget) throw new Error('Task exceeds context budget; shorten the request or increase numCtx');
  return { messages: result, before, after: bytes(result), compacted: true };
}
module.exports = { Memory, compact };
