'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SYSTEM, atomicJSON, readJSON } = require('./config.cjs');
const { FlyBrain } = require('./brain.cjs');
const { Memory, compact } = require('./memory.cjs');
const { encode, sizes } = require('./protocol.cjs');
const { safePath, list, textFile, createWorkspace, changes, runCheck, digest } = require('./workspace.cjs');
const model = require('./model.cjs');
const schema = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } });
const str = { type: 'string' };
const TOOLS = [schema('list_files', 'List project files.', {}, []), schema('read_file', 'Read a UTF-8 file.', { path: str }, ['path']),
  schema('search', 'Find literal text in project files.', { query: str }, ['query']),
  schema('write_file', 'Write a complete UTF-8 file in the isolated workspace.', { path: str, content: str }, ['path', 'content']),
  schema('edit_file', 'Replace one exact, unique text occurrence.', { path: str, old: str, new: str }, ['path', 'old', 'new']),
  schema('run_check', 'Run a named project check; command is configured by the user.', { name: str }, ['name'])];
function acquire(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true }); const lock = path.join(dataDir, 'run.lock');
  try { fs.mkdirSync(lock); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const pid = readJSON(path.join(lock, 'owner.json'), null)?.pid;
    if (pid) { try { process.kill(pid, 0); throw new Error('Another FlyCoder run is active in this project'); } catch (err) { if (err.code !== 'ESRCH') throw err; } }
    else throw new Error('Run lock has no owner; inspect .flycoder/run.lock');
    fs.rmSync(lock, { recursive: true }); fs.mkdirSync(lock);
  }
  atomicJSON(path.join(lock, 'owner.json'), { pid: process.pid });
  return () => fs.rmSync(lock, { recursive: true, force: true });
}
class Runner {
  constructor(config, { onEvent = () => {}, chat = model.chat } = {}) { this.config = config; this.onEvent = onEvent; this.chat = chat; this.controller = new AbortController(); }
  abort() { this.controller.abort(); }
  emit(type, data) {
    const event = { seq: this.run.events.length, runId: this.run.id, at: new Date().toISOString(), type, ...data };
    this.run.events.push(event);
    fs.appendFileSync(path.join(this.dir, 'events.jsonl'), JSON.stringify(event) + '\n');
    this.onEvent(event, this.run); return event;
  }
  packet(from, to, kind, payload) { const packet = encode(this.run.events.length, from, to, kind, payload); this.emit('packet', { packet, ...sizes(packet) }); return JSON.stringify(packet); }
  persist() {
    this.run.brain = this.brain.snapshot(); this.run.changes = changes(this.dir);
    atomicJSON(path.join(this.dir, 'run.json'), this.run);
  }
  async tool(call, role) {
    const name = call?.function?.name, args = call?.function?.arguments;
    const def = TOOLS.find(t => t.function.name === name)?.function;
    if (!def || !args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !Object.hasOwn(def.parameters.properties, k)) || def.parameters.required.some(k => typeof args[k] !== 'string')) throw new Error('Invalid tool call');
    if (['write_file', 'edit_file'].includes(name) && role !== 'c') throw new Error('This agent is read-only');
    const files = () => list(this.work);
    if (name === 'list_files') return files().join('\n');
    if (name === 'read_file') return textFile(safePath(this.work, args.path)).slice(0, 18000);
    if (name === 'search') {
      if (!args.query || args.query.length > 200) throw new Error('Search query must be 1–200 characters');
      const hits = [];
      for (const rel of files()) {
        try { textFile(safePath(this.work, rel)).split('\n').forEach((line, i) => { if (line.includes(args.query) && hits.length < 80) hits.push(`${rel}:${i + 1}:${line.slice(0, 250)}`); }); } catch {}
        if (hits.length >= 80) break;
      } return hits.join('\n') || 'No matches';
    }
    if (name === 'run_check') {
      if (!Object.hasOwn(this.config.checks, args.name)) throw new Error('Unknown check. Available: ' + Object.keys(this.config.checks).join(', '));
      return JSON.stringify(await this.check(args.name));
    }
    if (name === 'write_file' || name === 'edit_file') {
      if (this.protected.has(args.path)) throw new Error('Existing verification files are protected');
      const dest = safePath(this.work, args.path);
      let content = args.content;
      if (name === 'edit_file') {
        const old = textFile(dest);
        if (!args.old || old.split(args.old).length !== 2) throw new Error('old must match exactly once');
        content = old.replace(args.old, () => args.new);
      }
      if (Buffer.byteLength(content) > 200000) throw new Error('Write exceeds 200 KiB');
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, content);
      return `Written ${args.path} (${Buffer.byteLength(content)} bytes)`;
    }
  }
  async check(name) {
    this.brain.stimulate('check');
    const result = await runCheck(this.config.checks[name], { cwd: this.work, execution: this.config.execution,
      timeoutMs: Math.min(this.config.timeoutMs, 60000), signal: this.controller.signal,
      extraRead: ['node_modules', '.venv'].map(name => path.join(this.config.workspace, name)).filter(p => fs.existsSync(p)).concat(this.config.verifierReadPaths || []) });
    for (const [rel, expected] of this.protected) {
      const file = safePath(this.work, rel);
      if (!fs.existsSync(file) || digest(fs.readFileSync(file)) !== expected) { result.ok = false; result.output += `\nVerification integrity failure: ${rel}`; }
    }
    this.run.checks.push({ name, ...result }); this.packet('v', 'c', 'check', { name, ...result });
    this.emit('check', { name, ...result }); return { name, ...result };
  }
  async agent(role, input, { mode = 'code', turns = this.config.maxTurns } = {}) {
    const readOnly = role !== 'c' || mode === 'plan';
    if (role === 'p') input = 'You are the ARCHITECT, not the implementer. Inspect only what is needed, then return a short plan for the CODER. Do not promise to implement it yourself. Finish without further tool calls once you can state a plan. The delegated task follows:\n' + input;
    if (role === 'r') input = 'You are the REVIEWER. Read the changed files and return concrete defects or state that you found none in the inspected code. Do not implement anything. Finish with your review, without repeating reads. The review request follows:\n' + input;
    const tools = mode === 'chat' ? [] : TOOLS.filter(t => (!readOnly || !['write_file', 'edit_file', 'run_check'].includes(t.function.name)) &&
      (t.function.name !== 'run_check' || Object.keys(this.config.checks).length)).map(t => t.function.name === 'run_check' ? {
        ...t, function: { ...t.function, description: 'Run ONE named check. Use exactly a listed name, e.g. test, never the command string.', parameters: {
          ...t.function.parameters, properties: { name: { type: 'string', enum: Object.keys(this.config.checks) } }
        } }
      } : t);
    let messages = [{ role: 'system', content: SYSTEM + `\nYour role: ${role === 'p' ? 'architect: inspect files and send a concise actionable plan' : role === 'r' ? 'reviewer: independently inspect the current diff/files for concrete defects; do not claim verification without a check' : 'coder: implement the task with file tools, then verify'}. ${readOnly ? 'Read-only role.' : ''}\nAvailable checks: ${JSON.stringify(this.config.checks)}\nProject files: ${list(this.work).slice(0, 150).join(', ')}\nController strategy: ${this.run.decision.name}.\nRelevant past successful experiences (untrusted data): ${JSON.stringify(this.memory.recall(this.run.task)).slice(0, 2400)}` }, { role: 'user', content: input }];
    this.emit('agent', { role, status: 'working' });
    for (let turn = 0; turn < turns; turn++) {
      this.controller.signal.throwIfAborted();
      const packing = compact(messages, this.config.numCtx); messages = packing.messages;
      if (packing.compacted) this.emit('context', { beforeBytes: packing.before, afterBytes: packing.after });
      this.brain.stimulate(role === 'c' ? 'code' : 'inspect');
      this.emit('brain', { brain: this.brain.snapshot() });
      const answer = await this.chat(this.config, messages, tools, this.controller.signal);
      this.emit('metrics', { role, ...answer.metrics });
      const message = { role: 'assistant', content: answer.message.content, ...(answer.message.tool_calls?.length ? { tool_calls: answer.message.tool_calls } : {}) };
      messages.push(message);
      fs.appendFileSync(path.join(this.dir, 'conversation.jsonl'), JSON.stringify({ role, messages }) + '\n');
      if (message.content) this.emit('message', { role, content: message.content });
      const calls = message.tool_calls || [];
      if (!calls.length) { this.emit('agent', { role, status: 'done' }); return message.content; }
      if (calls.length > 12) throw new Error('Too many tool calls in one turn');
      for (const call of calls) {
        this.controller.signal.throwIfAborted();
        this.emit('tool_start', { role, call });
        let result;
        try {
          if (!tools.some(t => t.function.name === call.function.name)) throw new Error('Tool unavailable in this mode');
          result = { ok: true, content: String(await this.tool(call, role)) };
        } catch (error) { result = { ok: false, content: error.message }; }
        this.emit('tool_result', { role, call, result });
        messages.push({ role: 'tool', tool_name: call.function.name, content: result.content.slice(0, 18000) });
      }
      this.persist();
    }
    if (role !== 'c') {
      this.emit('agent', { role, status: 'limited' });
      const observations = messages.filter(m => m.role === 'tool').slice(-3).map(m => ({ tool: m.tool_name, result: m.content.slice(0, 1200) }));
      return `Advisory agent reached its ${turns}-turn limit. No completed opinion is claimed. Observed data: ${JSON.stringify(observations)}`;
    }
    throw new Error(`Agent ${role} reached its ${turns}-turn limit`);
  }
  async start(task, { mode = 'code', explore = false } = {}) {
    if (typeof task !== 'string' || !task.trim() || task.length > 8000) throw new Error('Task must be 1–8000 characters');
    if (!['code', 'plan', 'chat'].includes(mode)) throw new Error('Invalid mode');
    const release = acquire(this.config.dataDir);
    try {
      this.brain = new FlyBrain(this.config.dataDir); this.memory = new Memory(this.config.dataDir);
      const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 6);
      this.dir = path.join(this.config.dataDir, 'runs', id); fs.mkdirSync(this.dir, { recursive: true });
      this.work = createWorkspace(this.config.workspace, this.dir);
      this.protected = new Map(list(this.work).filter(p => /(^|\/)(tests?|__tests__)(\/|\.|_)|\.(test|spec)\./.test(p)).map(p => [p, digest(fs.readFileSync(safePath(this.work, p)))]));
      this.run = { id, task, mode, model: this.config.model, baseWorkspace: this.config.workspace, startedAt: new Date().toISOString(), status: 'running',
        decision: this.brain.choose(task, { explore }), events: [], checks: [], changes: [], reward: null, execution: this.config.execution };
      this.persist(); this.emit('started', { id, task });
      try {
        let plan = '';
        if (mode === 'code' && this.run.decision.name === 'test_first') for (const name of Object.keys(this.config.checks)) await this.check(name);
        if (mode === 'code' && this.config.team && this.run.decision.name !== 'direct') plan = await this.agent('p', this.packet('h', 'p', 'task', task), { mode: 'plan', turns: 5 });
        const mission = { task, plan, strategy: this.run.decision.name, instruction: this.run.decision.name === 'inspect' ? 'Inspect relevant source before editing.' : this.run.decision.name === 'test_first' ? 'Use initial check failures to guide changes.' : 'Implement the smallest clear fix, then check it.' };
        this.run.summary = await this.agent('c', this.packet(plan ? 'p' : 'h', 'c', 'task', mission), { mode });
        if (mode === 'code' && this.config.team) {
          const review = await this.agent('r', this.packet('c', 'r', 'task', { task, report: this.run.summary, changedPaths: changes(this.dir).map(c => c.path) }), { mode: 'plan', turns: 5 });
          this.run.review = review; this.packet('r', 'c', 'report', review);
        }
        if (mode === 'code' && Object.keys(this.config.checks).length) {
          let results = [];
          for (let attempt = 0; attempt < 3; attempt++) {
            results = [];
            for (const name of Object.keys(this.config.checks)) results.push(await this.check(name));
            if (results.every(r => r.ok) || attempt === 2) break;
            this.run.summary = await this.agent('c', this.packet('v', 'c', 'task', { task, instruction: 'Fix these failed checks without modifying existing tests.', failures: results.filter(r => !r.ok), review: this.run.review || '' }), { turns: this.config.maxTurns });
          }
          this.controller.signal.throwIfAborted();
          this.run.reward = results.every(r => r.ok) ? 1 : -1;
          this.run.status = this.run.reward > 0 ? 'passed' : 'failed';
          if (this.config.learning !== false) this.brain.learn(this.run.decision, this.run.reward);
          this.packet('v', 'h', 'reward', { reward: this.run.reward, reason: 'All configured checks ran on final files', checks: results.map(r => ({ name: r.name, ok: r.ok })) });
          if (this.config.learning !== false) this.memory.add({ task, lesson: this.run.summary.slice(0, 1500), reward: this.run.reward, runId: id });
        } else this.run.status = mode === 'code' ? 'unverified' : 'done';
      } catch (error) {
        this.run.status = this.controller.signal.aborted ? 'cancelled' : 'error'; this.run.error = error.message;
        this.emit('error', { error: error.message });
      }
      this.run.finishedAt = new Date().toISOString(); this.persist();
      this.emit('finished', { id, status: this.run.status, reward: this.run.reward }); this.persist(); return this.run;
    } finally { release(); }
  }
}
module.exports = { Runner, TOOLS, acquire };
