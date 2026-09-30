'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const os = require('node:os');
const { atomicJSON, readJSON } = require('./config.cjs');
const SKIP = new Set(['.git', '.flycoder', '.references', '.venv', 'node_modules', 'dist', 'build', 'data', '__pycache__', '.next']);
const secret = p => p.split(/[\\/]/).some(x => /^(\.env(?:\..*)?|\.ssh|\.aws|\.codex|\.npmrc|\.netrc|credentials.*)$/i.test(x) || /\.(pem|key|p12)$/i.test(x));
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || path.isAbsolute(relative) || relative.split(/[\\/]/).some(p => p === '..' || SKIP.has(p)) || secret(relative)) throw new Error('Path refused. Use a workspace-relative path exactly as listed by list_files, e.g. solution.cjs; never an absolute path, .. or secret file.');
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error('Path outside workspace');
  let cursor = root;
  for (const segment of path.relative(root, target).split(path.sep)) {
    cursor = path.join(cursor, segment);
    try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Symlinks are not available to agents'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return target;
}
function list(root, sub = '', result = []) {
  for (const dirent of fs.readdirSync(path.join(root, sub), { withFileTypes: true })) {
    const rel = path.join(sub, dirent.name);
    if (SKIP.has(dirent.name) || secret(rel) || dirent.isSymbolicLink()) continue;
    if (result.length >= 3000) throw new Error('Workspace exceeds 3000 files; select a smaller project');
    if (dirent.isDirectory()) list(root, rel, result);
    else if (dirent.isFile()) result.push(rel);
  }
  return result;
}
function textFile(file) { const data = fs.readFileSync(file); if (data.includes(0)) throw new Error('Binary file'); if (data.length > 1024 * 1024) throw new Error('File exceeds 1 MiB'); return data.toString('utf8'); }
function createWorkspace(source, runDir) {
  const target = path.join(runDir, 'workspace'); fs.mkdirSync(target, { recursive: true });
  const manifest = {}; let total = 0;
  for (const rel of list(source)) {
    const origin = safePath(source, rel), stat = fs.statSync(origin);
    if (stat.size > 2 * 1024 * 1024) continue;
    total += stat.size; if (total > 64 * 1024 * 1024) throw new Error('Workspace exceeds 64 MiB');
    const data = fs.readFileSync(origin); manifest[rel] = digest(data);
    const dest = safePath(target, rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data, { mode: stat.mode });
  }
  // Dependencies are shared read-only by the OS sandbox, never copied or edited
  // through agent file tools. This makes existing npm projects executable.
  for (const name of ['node_modules', '.venv']) {
    const dep = path.join(source, name);
    if (fs.existsSync(dep) && fs.statSync(dep).isDirectory()) fs.symlinkSync(fs.realpathSync(dep), path.join(target, name));
  }
  atomicJSON(path.join(runDir, 'manifest.json'), manifest); return target;
}
function changes(runDir) {
  const root = path.join(runDir, 'workspace'), before = readJSON(path.join(runDir, 'manifest.json'), {});
  return list(root).flatMap(rel => {
    const file = safePath(root, rel), data = fs.readFileSync(file);
    if (digest(data) === before[rel]) return [];
    return [{ path: rel, status: before[rel] ? 'modified' : 'added', hash: digest(data), content: data.includes(0) ? null : data.toString('utf8').slice(0, 100000) }];
  });
}
function applyRun(runDir, source) {
  const run = readJSON(path.join(runDir, 'run.json'), null);
  if (!run || run.status === 'running') throw new Error('Run is not complete');
  if (fs.realpathSync(run.baseWorkspace) !== fs.realpathSync(source)) throw new Error('This run belongs to another workspace (for example a training exercise)');
  const manifest = readJSON(path.join(runDir, 'manifest.json'), {}), delta = changes(runDir);
  // Check every conflict before the first write.
  for (const change of delta) {
    const dest = safePath(source, change.path);
    const actual = fs.existsSync(dest) ? digest(fs.readFileSync(dest)) : undefined;
    if (actual !== manifest[change.path]) throw new Error(`Conflict: ${change.path} changed since this run`);
  }
  for (const change of delta) {
    const dest = safePath(source, change.path); fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(safePath(path.join(runDir, 'workspace'), change.path), dest);
  }
  return delta.map(c => c.path);
}
function sandboxProfile(cwd, scratch) {
  const quote = value => JSON.stringify(fs.realpathSync(value));
  const locations = ['/usr', '/bin', '/sbin', '/System', '/Library', '/Applications', '/opt', '/dev', '/private/var/db', cwd, scratch, path.dirname(path.dirname(fs.realpathSync(process.execPath)))].filter(p => fs.existsSync(p));
  return `(version 1)\n(deny default)\n(allow process* sysctl-read mach-lookup ipc-posix* file-read-metadata)\n(allow file-read* (literal "/") ${locations.map(p => `(subpath ${quote(p)})`).join(' ')})\n(allow file-write* (subpath ${quote(cwd)}) (subpath ${quote(scratch)}) (literal "/dev/null"))\n`;
}
async function runCheck(argv, { cwd, execution = 'sandbox', timeoutMs = 30000, signal, extraRead = [] } = {}) {
  if (signal?.aborted) throw new Error('Cancelled');
  if (!Array.isArray(argv) || !argv.length || argv.some(v => typeof v !== 'string' || v.includes('\0'))) throw new Error('Invalid check argv');
  cwd = fs.realpathSync(cwd);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'flycoder-check-'));
  let command = argv[0], args = argv.slice(1);
  if (execution === 'sandbox') {
    if (process.platform !== 'darwin' || !fs.existsSync('/usr/bin/sandbox-exec')) { fs.rmSync(scratch, { recursive: true, force: true }); throw new Error('Sandbox unavailable. Use a disposable environment or explicitly configure execution: trusted.'); }
    let profile = sandboxProfile(cwd, scratch);
    for (const p of extraRead) profile += `(allow file-read* (subpath ${JSON.stringify(fs.realpathSync(p))}))\n`;
    const file = path.join(scratch, 'profile.sb'); fs.writeFileSync(file, profile);
    command = '/usr/bin/sandbox-exec'; args = ['-f', file, ...argv];
  }
  const started = Date.now();
  try {
    return await new Promise((resolve, reject) => {
      let output = '', timedOut = false, cancelled = false, settled = false;
      const child = spawn(command, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH, HOME: scratch, TMPDIR: scratch, TMP: scratch, TEMP: scratch, LANG: 'en_US.UTF-8', CI: '1', PYTHONDONTWRITEBYTECODE: '1' } });
      const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
      const abort = () => { cancelled = true; kill(); };
      const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      const collect = buf => { if (output.length < 20000) output += buf.toString().slice(0, 20000 - output.length); };
      child.stdout.on('data', collect); child.stderr.on('data', collect);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); kill(); };
      child.once('error', e => { if (settled) return; settled = true; cleanup(); reject(e); });
      child.once('close', (code, sig) => { if (settled) return; settled = true; cleanup(); resolve({ ok: code === 0 && !timedOut && !cancelled, exitCode: code, signal: sig, timedOut, cancelled, output, durationMs: Date.now() - started, execution }); });
    });
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}
module.exports = { safePath, secret, list, textFile, digest, createWorkspace, changes, applyRun, runCheck };
