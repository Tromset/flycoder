'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { buildMessages, buildDialogueMessages, summarizeState } = require('./fly-language');

function createFlyVoice({ getState, directory = path.join(__dirname, '../data/fly-language'),
  baseUrl = process.env.FLY_LLM_BASE_URL || 'http://127.0.0.1:8081/v1',
  model = process.env.FLY_LLM_MODEL || 'mlx-community/Qwen2.5-1.5B-Instruct-4bit',
  dialogueModel = process.env.FLY_DIALOGUE_MODEL || 'mlx-community/Qwen2.5-7B-Instruct-4bit',
  adapterPath = process.env.FLY_LLM_ADAPTER_PATH || (process.env.FLY_LLM_BASE_URL ? null : path.join(directory, 'best')),
  fetchImpl = fetch, isControlBusy = () => false }) {
  fs.mkdirSync(directory, { recursive: true });
  const db = new Database(path.join(directory, 'chat.db'));
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, role TEXT NOT NULL, message TEXT NOT NULL, timestamp TEXT NOT NULL, state TEXT, mode TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO messages (role, message, timestamp, state, mode) VALUES (?, ?, ?, ?, ?)');
  const recent = db.prepare('SELECT role, message, timestamp, mode FROM (SELECT * FROM messages ORDER BY id DESC LIMIT ?) ORDER BY id');
  let busy = false;

  function json(res, status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  }

  async function status(sessionId) {
    let training = { status: 'not_started' };
    try { training = JSON.parse(fs.readFileSync(path.join(directory, 'status.json'), 'utf8')); } catch (_) { /* no session yet */ }
    // A terminated process cannot leave a misleading "training" indicator.
    if (training.pid && ['loading', 'baseline', 'training', 'evaluating', 'serving'].includes(training.status)) {
      try { process.kill(training.pid, 0); } catch (error) { if (error.code === 'ESRCH') training.status = 'stopped'; }
    }
    let ready = false;
    try {
      const response = await fetchImpl(baseUrl + '/models', { signal: AbortSignal.timeout(1500) });
      const body = await response.json();
      ready = response.ok && Array.isArray(body.data) && [model, dialogueModel].every(id => body.data.some(m => m.id === id));
    } catch (_) { /* backend is not running */ }
    return { ready, busy, model, dialogueModel, stateAvailable: summarizeState(getState(sessionId)).available,
      training: { status: training.status, iteration: training.iteration || 0, iterations: training.iterations || 0,
        validationLoss: training.validationLoss, baselineTestLoss: training.baselineTestLoss, adaptedTestLoss: training.adaptedTestLoss } };
  }

  async function chat(req, res, mode) {
    if (busy) return json(res, 429, { error: 'La mouche prépare déjà une réponse. Réessaie dans un instant.' });
    busy = true;
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 8192) return json(res, 413, { error: 'Message trop long.' });
      }
      let parsed;
      try { parsed = JSON.parse(body || '{}'); } catch (_) { return json(res, 400, { error: 'JSON invalide.' }); }
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return json(res, 400, { error: 'Objet JSON attendu.' });
      const question = mode === 'thought' ? 'À quoi penses-tu en ce moment ? Exprime ton besoin principal en une ou deux phrases.' : parsed.message;
      if (typeof question !== 'string' || !question.trim() || question.length > 1500) {
        return json(res, 400, { error: 'Écris un message de 1 à 1 500 caractères.' });
      }
      if (parsed.sessionId != null && (typeof parsed.sessionId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(parsed.sessionId))) {
        return json(res, 400, { error: 'Session invalide.' });
      }
      // Reserve the next inference for dialogue. Motor requests see busy=true
      // and wait, so continuous control cannot starve the user's conversation.
      const waitUntil = Date.now() + 22000;
      while (isControlBusy() && Date.now() < waitUntil) await new Promise(resolve => setTimeout(resolve, 50));
      if (isControlBusy()) return json(res, 503, { error: 'Le contrôleur Qwen ne répond pas. Réessaie dans un instant.' });
      const state = getState(parsed.sessionId);
      const snapshot = summarizeState(state);
      // Avoid presenting hallucinations as current measurements when disconnected.
      if (!snapshot.available) return json(res, 409, { error: 'La simulation ne transmet pas d’état récent. Ouvre l’habitat pour que je puisse te répondre.' });
      const timestamp = new Date().toISOString();
      const history = mode === 'thought' ? [] : recent.all(6).map(m => ({ role: m.role, content: m.message }));
      const signal = AbortSignal.timeout(60000);
      async function complete(body) {
        const response = await fetchImpl(baseUrl + '/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
          body: JSON.stringify({ ...body, temperature: 0.2, top_p: 0.9, max_tokens: 180, stream: false })
        });
        if (!response.ok) throw new Error('Qwen HTTP ' + response.status);
        const data = await response.json();
        const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (typeof text !== 'string' || !text.trim()) throw new Error('Qwen returned an empty response');
        return text.trim();
      }
      const draft = await complete({
        // MLX 0.31.3 needs the explicit adapters field when model is a repo ID;
        // relying on --adapter-path alone can silently load the base weights.
        model, ...(adapterPath ? { adapters: adapterPath } : {}), messages: buildMessages(state, 'À quoi penses-tu ?')
      });
      const message = await complete({ model: dialogueModel, messages: buildDialogueMessages(state, question.trim(), history, draft) });
      db.transaction(() => {
        insert.run('user', question.trim(), timestamp, JSON.stringify(snapshot), mode);
        insert.run('assistant', message.trim(), new Date().toISOString(), JSON.stringify(snapshot), mode);
      })();
      json(res, 200, { role: 'assistant', speaker: 'fly', message: message.trim(), timestamp, model, dialogueModel, mode, state: snapshot });
    } catch (error) {
      process.stderr.write('[fly-voice] ' + error.message + '\n');
      json(res, 503, { error: 'Qwen est indisponible pour le moment. Consulte l’état de l’entraînement puis relance le modèle si nécessaire.' });
    } finally { busy = false; }
  }

  function handle(req, res) {
    if (!req.url.startsWith('/fly/')) return false;
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/fly/status') {
      status(url.searchParams.get('sessionId')).then(value => json(res, 200, value)).catch(() => json(res, 500, { error: 'État indisponible.' }));
    } else if (req.method === 'GET' && url.pathname === '/fly/history') {
      json(res, 200, recent.all(50));
    } else if (req.method === 'POST' && ['/fly/chat', '/fly/thought'].includes(req.url)) {
      chat(req, res, req.url.endsWith('/thought') ? 'thought' : 'chat');
    } else json(res, 404, { error: 'Route inconnue.' });
    return true;
  }
  return { handle, close: () => db.close(), status, isBusy: () => busy };
}
module.exports = { createFlyVoice };
