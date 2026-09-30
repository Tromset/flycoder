'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { ROOT, readJSON, atomicJSON } = require('./config.cjs');
const ACTIONS = ['inspect', 'test_first', 'direct'];
const hash = text => { let h = 2166136261; for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function features(text) {
  const values = Array(64).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}_./-]+/gu) || []) values[hash(word) % 64] += 1;
  const active = values.map((v, i) => [v, i]).filter(x => x[0]).sort((a, b) => b[0] - a[0]).slice(0, 8);
  const result = Array(64).fill(0); for (const [, i] of active) result[i] = 1 / Math.sqrt(active.length);
  return result;
}
class FlyBrain {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'brain.json');
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/constants.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/connectome.js'), 'utf8'), context);
    this.graph = JSON.parse(JSON.stringify(context.weights));
    this.regions = JSON.parse(JSON.stringify(context.BRAIN.neuronRegions));
    this.state = readJSON(this.file, { version: 1, episodes: 0, baseline: 0, totalReward: 0,
      weights: ACTIONS.map(() => Array(64).fill(0)), bias: [0.1, 0, 0], visits: [0, 0, 0] });
    if (this.state.version !== 1 || this.state.weights.length !== 3 || this.state.weights.some(w => w.length !== 64 || w.some(v => !Number.isFinite(v)))) throw new Error('Invalid controller checkpoint');
    this.activation = Object.fromEntries(Object.keys(this.graph).map(id => [id, 0]));
    this.x = Array(64).fill(0); this.probabilities = [1/3, 1/3, 1/3];
  }
  stimulate(kind, magnitude = 1) {
    const source = { task: 'OLF_PN', inspect: 'CX_EPG', code: 'CX_FC', check: 'MB_KC', reward: 'MB_DAN_REW', error: 'MB_DAN_PUN' }[kind] || 'MB_KC';
    this.activation[source] = Math.min(1, Math.abs(magnitude));
    for (let step = 0; step < 3; step++) {
      const next = Object.fromEntries(Object.entries(this.activation).map(([id, v]) => [id, v * 0.75]));
      for (const [from, edges] of Object.entries(this.graph)) for (const [to, w] of Object.entries(edges))
        next[to] = (next[to] || 0) + this.activation[from] * w / 32;
      this.activation = Object.fromEntries(Object.entries(next).map(([id, v]) => [id, Math.max(0, Math.min(1, v))]));
    }
  }
  choose(text, { explore = false } = {}) {
    this.x = features(text); this.stimulate('task');
    const scores = this.state.weights.map((w, a) => w.reduce((v, wi, i) => v + wi * this.x[i], this.state.bias[a]));
    // The live functional network modulates routing, beyond its visual representation.
    scores[0] += 0.12 * (this.activation.CX_EPG || 0);
    scores[1] += 0.12 * (this.activation.MB_MBON_AV || 0);
    scores[2] += 0.12 * (this.activation.MB_MBON_APP || 0);
    const exp = scores.map(s => Math.exp(s - Math.max(...scores))), total = exp.reduce((a, b) => a + b, 0);
    this.probabilities = exp.map(v => v / total);
    const index = explore ? this.state.episodes % 3 : scores.indexOf(Math.max(...scores));
    const action = Math.floor(index); this.state.visits[action]++;
    this.decision = { action, name: ACTIONS[action], features: [...this.x], probabilities: [...this.probabilities] };
    return this.decision;
  }
  learn(decision, reward) {
    if (!Number.isFinite(reward) || reward < -1 || reward > 1) throw new Error('Reward outside [-1,1]');
    const advantage = reward - this.state.baseline;
    for (let a = 0; a < 3; a++) {
      const gradient = ((a === decision.action ? 1 : 0) - decision.probabilities[a]) * advantage * 0.15;
      this.state.bias[a] = Math.max(-4, Math.min(4, this.state.bias[a] + gradient));
      for (let i = 0; i < 64; i++) this.state.weights[a][i] = Math.max(-4, Math.min(4, this.state.weights[a][i] + gradient * decision.features[i]));
    }
    this.state.episodes++; this.state.totalReward += reward;
    this.state.baseline = this.state.baseline * 0.9 + reward * 0.1;
    this.stimulate(reward > 0 ? 'reward' : 'error', Math.abs(reward)); this.save();
  }
  save() { atomicJSON(this.file, this.state); }
  snapshot() {
    const nodes = Object.entries(this.activation).map(([id, value]) => ({ id, value, kind: 'functional', region: Object.keys(this.regions).find(r => this.regions[r].includes(id)) || 'motor' }));
    const edges = Object.entries(this.graph).flatMap(([from, ws]) => Object.entries(ws).map(([to, weight]) => ({ from, to, weight, trainable: false })));
    this.x.forEach((value, i) => nodes.push({ id: `KC_${i}`, value, kind: 'sparse', region: 'memory' }));
    ACTIONS.forEach((action, a) => {
      nodes.push({ id: `SWE_${action}`, value: this.probabilities[a], bias: this.state.bias[a], kind: 'policy', region: 'policy' });
      this.state.weights[a].forEach((weight, i) => edges.push({ from: `KC_${i}`, to: `SWE_${action}`, weight, trainable: true }));
    });
    return { source: 'FlyBrain functional circuits + sparse Kenyon-inspired policy', biological: false, qwenActivationsAvailable: false,
      nodes, edges, episodes: this.state.episodes, totalReward: this.state.totalReward, decision: this.decision?.name || null };
  }
}
module.exports = { FlyBrain, features, ACTIONS };
