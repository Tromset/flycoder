'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { MODEL, BASE_MODEL, SYSTEM, ROOT } = require('./config.cjs');
async function request(host, route, body, signal, timeout = 180000) {
  const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
  let response;
  try { response = await fetch(host.replace(/\/$/, '') + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: combined }); }
  catch (e) { throw new Error(`Ollama unavailable at ${host}: ${e.message}`); }
  if (!response.ok) throw new Error(`Ollama ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
}
async function chat(config, messages, tools, signal) {
  const started = Date.now();
  const data = await request(config.host, '/api/chat', { model: config.model, stream: false, think: false, messages,
    ...(tools?.length ? { tools } : {}), options: { num_ctx: config.numCtx, num_predict: config.maxTokens, temperature: config.temperature } }, signal, config.timeoutMs);
  if (!data.message || typeof data.message.content !== 'string') throw new Error('Invalid Ollama chat response');
  if (data.done_reason === 'length') throw new Error('Model output truncated; increase maxTokens or reduce the task');
  return { message: data.message, metrics: { durationMs: Date.now() - started, promptTokens: data.prompt_eval_count ?? null, outputTokens: data.eval_count ?? null,
    tokensPerSecond: data.eval_duration > 0 ? Math.round(data.eval_count / data.eval_duration * 1e10) / 10 : null } };
}
async function status(config) {
  try { const data = await request(config.host, '/api/tags', null, null, 3000); const models = data.models || []; return { available: true, installed: models.some(m => m.name === config.model || m.name === config.model + ':latest'), models: models.map(m => ({ name: m.name, size: m.size, parameters: m.details?.parameter_size })) }; }
  catch (error) { return { available: false, installed: false, models: [], error: error.message }; }
}
async function install(config, { baseModel = BASE_MODEL, onProgress = () => {} } = {}) {
  // Pull uses NDJSON progress to avoid one long opaque request.
  const res = await fetch(config.host + '/api/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: baseModel, stream: true }), signal: AbortSignal.timeout(1800000) });
  if (!res.ok) throw new Error(`Model download HTTP ${res.status}`);
  let buffer = ''; const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n'); buffer = lines.pop();
    for (const line of lines.filter(Boolean)) { const event = JSON.parse(line); if (event.error) throw new Error(event.error); onProgress(event); }
  }
  if (buffer.trim()) { const event = JSON.parse(buffer); if (event.error) throw new Error(event.error); onProgress(event); }
  await request(config.host, '/api/create', { model: MODEL, from: baseModel, system: SYSTEM, parameters: { num_ctx: config.numCtx, temperature: 0.2 }, stream: false }, null, 180000);
  const checkpoint = path.join(ROOT, 'flycoder/models/controller-v1.json');
  if (fs.existsSync(checkpoint)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    try { fs.copyFileSync(checkpoint, path.join(config.dataDir, 'brain.json'), fs.constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  return { model: MODEL, baseModel };
}
module.exports = { chat, status, install, request };
