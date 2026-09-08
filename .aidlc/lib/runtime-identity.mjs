// why: a product recorded one runtime commit while its shim silently ran another.
// This factory is also embedded in the installed shim: never load a candidate to verify it.
import * as fs from 'node:fs';
import path from 'node:path';
import * as crypto from 'node:crypto';
import * as cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function identityTools(fs, path, crypto, cp) {
  const roots = ['.aidlc/bin', '.aidlc/lib', '.aidlc/checks', '.aidlc/sensors', '.aidlc/hooks', '.aidlc/adapters', '.aidlc/skills', '.aidlc/roles', '.aidlc/templates', '.aidlc/policies', '.aidlc/instructions.md', '.claude-plugin'];
  const hash = value => 'sha256:' + crypto.createHash('sha256').update(value).digest('hex');
  const covered = p => roots.some(r => p === r || p.startsWith(r + '/'));
  const git = (root, args) => { try { return cp.execFileSync('git', ['--no-replace-objects', '-c', 'core.fsmonitor=false', '-C', root, ...args], {
    encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES'].includes(key))), GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
  }); } catch { throw new Error('Git identity unavailable (' + args[0] + ')'); } };
  const diagnostic = e => e.code ? 'identity read unavailable (' + e.code + ')' : e.message;
  function safeRead(root, rel) {
    let p = root;
    for (const part of rel.split('/')) {
      if (!part || part === '.' || part === '..') throw new Error('unsafe identity path');
      p = path.join(p, part);
      let st; try { st = fs.lstatSync(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
      if (st.isSymbolicLink()) throw new Error('symlink in identity path: ' + rel);
    }
    const stat = fs.lstatSync(p);
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error('unsafe or oversized identity file: ' + rel);
    return { bytes: fs.readFileSync(p), mode: stat.mode & 0o111 ? '100755' : '100644' };
  }
  function manifest(root) {
    const entries = []; let total = 0;
    const walk = rel => {
      const abs = path.join(root, rel);
      let stat; try { stat = fs.lstatSync(abs); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
      if (stat.isSymbolicLink()) throw new Error('symlink in runtime: ' + rel);
      if (stat.isDirectory()) { for (const name of fs.readdirSync(abs).sort()) walk(rel + '/' + name); return; }
      const data = safeRead(root, rel);
      total += data.bytes.length;
      if (entries.length >= 4096 || total > 32 * 1024 * 1024) throw new Error('runtime inventory exceeds bounds');
      entries.push({ path: rel, mode: data.mode, digest: hash(data.bytes) });
    };
    for (const r of roots) walk(r);
    entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (!entries.some(e => e.path === '.aidlc/bin/harness')) throw new Error('runtime entrypoint missing');
    return { version: 1, digest: hash(JSON.stringify(entries)), entries };
  }
  function observe(root) {
    const content = manifest(root);
    let commit = null, committed = false;
    // Do not inherit a parent directory's Git identity for a cache without its own metadata.
    if (fs.existsSync(path.join(root, '.git'))) {
      commit = git(root, ['rev-parse', '--verify', 'HEAD']).trim();
      const tree = git(root, ['ls-tree', '-rz', '--full-tree', 'HEAD']).split('\0').filter(Boolean).map(line => {
        const tab = line.indexOf('\t'); const [mode, type, oid] = line.slice(0, tab).split(' ');
        return { path: line.slice(tab + 1), mode, type, oid };
      }).filter(e => covered(e.path)).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      committed = tree.length === content.entries.length && tree.every((e, i) => {
        const current = content.entries[i];
        if (e.path !== current.path || e.mode !== current.mode || e.type !== 'blob') return false;
        const bytes = safeRead(root, e.path).bytes;
        const oid = crypto.createHash(e.oid.length === 64 ? 'sha256' : 'sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
        return oid === e.oid;
      });
    }
    return { commit, committed, content };
  }
  function installation(root) {
    try {
      const seen = observe(root);
      return { version: 1, status: seen.committed ? 'verified' : 'unverified', commit: seen.commit, manifest: seen.content,
        method: seen.committed ? 'git-and-content' : 'unverified-source' };
    } catch (e) { return { version: 1, status: 'unverified', commit: null, error: diagnostic(e) }; }
  }
  function verify(project, root, self = false) {
    const remedy = 'Use the recorded clean runtime commit; upgrade deliberately with init from a clean checkout.';
    let observed;
    try { observed = observe(root); } catch (e) { return { status: 'mismatch', method: 'unavailable', error: diagnostic(e), remedy }; }
    if (self) return { status: observed.committed ? 'verified' : 'development', method: 'self-checkout', observed, expected: null, remedy: null };
    let record;
    try { const data = safeRead(project, '.aidlc/harness-install.json'); record = JSON.parse(data.bytes.toString('utf8')); } catch { /* explicit unavailable below */ }
    const expected = record?.identity;
    if (expected?.version !== 1 || expected.status !== 'verified' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(expected.commit ?? '') || record.commit !== expected.commit || expected.manifest?.version !== 1 || !Array.isArray(expected.manifest.entries) || expected.manifest.entries.length > 4096 || expected.manifest.digest !== hash(JSON.stringify(expected.manifest.entries))) {
      return { status: 'unverified', method: 'legacy-or-invalid-record', observed, expected: null, remedy };
    }
    const matches = JSON.stringify(expected.manifest) === JSON.stringify(observed.content) && (!observed.commit || observed.commit === expected.commit && observed.committed);
    return { status: matches ? 'verified' : 'mismatch', method: observed.commit ? 'git-and-content' : 'pinned-content', expected, observed, remedy: matches ? null : remedy };
  }
  return { roots, hash, git, safeRead, manifest, observe, installation, verify, diagnostic };
}
const api = identityTools(fs, path, crypto, cp);
export const RUNTIME_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const installationIdentity = api.installation;
export const RUNTIME_PATHS = api.roots;
export function runtimeIdentity(project, runtime = RUNTIME_ROOT) {
  return api.verify(project, runtime, fs.realpathSync(project) === fs.realpathSync(runtime));
}
export function policyIdentity(root) {
  const paths = ['.aidlc/harness.toml', '.aidlc/instructions.md', '.aidlc/policies/review.md', '.claude/CLAUDE.md', '.claude/settings.json', '.claude/settings.local.json', '.mcp.json', 'CLAUDE.md', 'AGENTS.md'];
  try {
    const entries = paths.sort().map(p => { const data = api.safeRead(root, p); return { path: p, digest: data ? api.hash(data.bytes) : null }; });
    let state = 'unavailable';
    try {
      const tree = new Map(api.git(root, ['ls-tree', '-rz', 'HEAD', '--', ...paths]).split('\0').filter(Boolean).map(line => {
        const tab = line.indexOf('\t'); return [line.slice(tab + 1), line.slice(0, tab).split(' ')];
      }));
      state = entries.every(e => {
        const record = tree.get(e.path), data = api.safeRead(root, e.path);
        if (!data) return !record;
        if (!record || record[1] !== 'blob' || record[0] !== data.mode) return false;
        const oid = crypto.createHash(record[2].length === 64 ? 'sha256' : 'sha1').update(Buffer.from('blob ' + data.bytes.length + '\0')).update(data.bytes).digest('hex');
        return oid === record[2];
      }) ? 'committed' : 'dirty';
    } catch { /* no Git */ }
    return { version: 1, digest: api.hash(JSON.stringify(entries)), entries, state };
  } catch (e) { return { version: 1, digest: null, state: 'unavailable', error: api.diagnostic(e) }; }
}
export function repositoryIdentity(root) {
  try { return { head: api.git(root, ['rev-parse', '--verify', 'HEAD']).trim(), dirty: Boolean(api.git(root, ['status', '--porcelain', '--untracked-files=normal']).trim()) }; }
  catch { return { head: null, dirty: null }; }
}
export function executionIdentity(root, { actor, change = null } = {}) {
  const clean = v => typeof v === 'string' && v.length > 0 && v.length <= 200 && !/[\x00-\x1f\x7f]/.test(v);
  if (actor !== undefined && !clean(actor)) throw new Error('--actor requires a plain label of 1–200 characters');
  const ciActor = clean(process.env.GITHUB_ACTOR) ? process.env.GITHUB_ACTOR : null;
  return { version: 1, invocation: crypto.randomUUID(), at: new Date().toISOString(), change,
    actor: { label: actor ?? ciActor, provenance: actor !== undefined ? 'explicit-label' : ciActor ? 'ci-environment-assertion' : 'unknown', authenticated: false },
    ci: Object.fromEntries(['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_JOB'].filter(k => clean(process.env[k])).map(k => [k, process.env[k]])),
    runtime: runtimeIdentity(root), policy: policyIdentity(root), repository: repositoryIdentity(root),
    trust: 'unsigned-local-observation',
  };
}
export function shimVerifierSource() {
  // Shell quoting is applied to the entire generated program by the caller.
  return `const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), cp = require("node:child_process"), os = require("node:os");
const api = (${identityTools.toString()})(fs, path, crypto, cp);
const project = path.dirname(process.env.HARNESS_PROJECT_AIDLC);
let rec; try { rec = JSON.parse(api.safeRead(project, ".aidlc/harness-install.json").bytes.toString("utf8")); } catch { rec = {}; }
const home = process.env.HARNESS_HOME;
const rootOf = d => path.basename(d) === ".aidlc" ? path.dirname(d) : d;
const attempt = d => { const root = rootOf(d); const result = api.verify(project, root); if (result.status === "verified") { process.stdout.write(path.join(root, ".aidlc")); return true; } process.stderr.write("harness: runtime " + result.status + " expected=" + (result.expected?.commit ?? rec.commit ?? "unknown") + " observed=" + (result.observed?.commit ?? "unavailable") + ". " + result.remedy + "\\n"); return false; };
if (home) { if (attempt(home)) process.exit(0); process.stderr.write("harness: HARNESS_HOME mismatch or holds no .aidlc/bin/harness; no fallback.\\n"); }
else if ([rec.marketplace, rec.plugin].every(v => typeof v === "string" && /^[a-zA-Z0-9_.-]+$/.test(v) && v !== "." && v !== "..")) {
 const base = path.join(os.homedir(), ".claude/plugins/cache", rec.marketplace, rec.plugin);
 if (fs.existsSync(base)) for (const version of fs.readdirSync(base).sort()) { if (attempt(path.join(base, version))) process.exit(0); }
}
process.stderr.write("harness: not installed with verified identity. Run claude plugin marketplace add <repository> and claude plugin install <plugin>@<marketplace>, or use the recorded clean HARNESS_HOME checkout.\\n"); process.exit(1);`;
}
