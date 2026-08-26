import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PREFIX_CACHE_PATHS } from './paths.mjs';
import { isCommitted, ownedFiles, validateContract } from './contract.mjs';

export function declaredFiles(text) {
  const body = String(text ?? '');
  const start = body.search(/^##\s*Files\b/im);
  if (start < 0) return null;
  const rest = body.slice(start);
  const next = rest.slice(1).search(/^##\s/m);
  const section = next >= 0 ? rest.slice(0, next + 1) : rest;
  const fence = section.match(/```[^\n]*\n([\s\S]*?)```/);
  if (!fence) return null;
  const files = fence[1].split('\n').map((l) => l.trim().replace(/^[-*]\s*/, '')).filter((l) => l && !l.startsWith('#'));
  return files.length ? files : null;
}

function contractScopeState(cfg) {
  const dir = cfg.layout?.contracts;
  if (!dir || !existsSync(dir)) return { declared: [], parseError: false };
  const declared = [];
  let parseError = false;
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    try {
      const file = path.join(dir, name); const text = readFileSync(file, 'utf8');
      const validation = validateContract(cfg.layout.root, file);
      if (!validation.ok || validation.meta.plan_status !== 'approved' || !isCommitted(cfg.layout.root, file)) continue;
      const files = ownedFiles(text);
      if (!files) { parseError = true; continue; }
      declared.push(...files);
    } catch { parseError = true; }
  }
  return { declared, parseError };
}

function matchesDeclared(rel, declared) {
  return declared.some((d) => rel === d || rel.startsWith(d.replace(/\/$/, '') + '/'));
}

function artifactOrState(rel) {
  return rel.startsWith('.aidlc/artifacts/') || rel.startsWith('.aidlc/state/');
}

export function writeBlocked(rel, cfg) {
  const norm = String(rel ?? '').replace(/^\.\//, '');
  if (!norm || norm.startsWith('..')) return null;
  for (const p of PREFIX_CACHE_PATHS) {
    if (norm === p || norm.endsWith('/' + p)) {
      return `${p} is part of the cached prompt prefix. Editing it mid-session invalidates the prompt cache for every remaining turn. Ask the human to change it between sessions.`;
    }
  }
  for (const p of cfg.guard?.protected_paths ?? []) {
    if (norm === p || norm.startsWith(p.replace(/\/$/, '') + '/')) return `${p} is listed in harness.toml [guard].protected_paths.`;
  }
  const lock = path.join(cfg.layout.state, 'test-lock.json');
  if (existsSync(lock)) {
    try {
      const { patterns = [], why = 'a bug fix is in progress' } = JSON.parse(readFileSync(lock, 'utf8'));
      for (const pat of patterns) {
        if (pat && norm.includes(pat)) return `${norm} is test-locked because ${why}. Fix the code, not the test. Run: .aidlc/bin/harness lock clear`;
      }
    } catch { /* a malformed lock must not block work */ }
  }
  const requireContract = cfg.guard?.require_contract ?? false;
  if (requireContract && !artifactOrState(norm)) {
    try {
      const { declared, parseError } = contractScopeState(cfg);
      if (parseError && !declared.length) return null;
      if (!declared.length) return `${norm} needs a committed approved delivery contract before product files change. Create and approve the contract, or set [guard].require_contract = false.`;
      if (!matchesDeclared(norm, declared)) return `${norm} is outside every approved contract's Structure and ownership section.`;
    } catch { return null; }
  }
  return null;
}

const PRODUCTION = /\b(production|prod)\b/i;
const DEPLOY = /\b(deploy|terraform\s+apply|kubectl\s+apply|helm\s+upgrade|harness\s+deploy)\b/i;

export function productionDenied(cmd, env = process.env) {
  const text = String(cmd ?? '');
  if (!DEPLOY.test(text) || !PRODUCTION.test(text)) return null;
  if (env?.HARNESS_RELEASE_APPROVAL) return null;
  return 'Production deploys need a release authorization. Set HARNESS_RELEASE_APPROVAL or pass --approval to harness deploy.';
}

// Write *destinations*, not the presence of a `>` somewhere in the string.
//
// The previous version asked two questions of the whole command — does it contain `>`, and does
// a protected path appear anywhere — and denied when both were true. `2>&1` answers the first
// and merely naming the file answers the second, so reading a protected file was denied. It
// fired six times against read-only commands in the session that fixed it, once refusing to let
// the intent describing the defect be written, because the prose named a protected path.
//
// Deliberately regex-level: shell is not parseable without a parser, and the tree-sitter
// decision in docs/BUILD-PLAN.md Phase 3 applies here too. The trade is the one the spec states
// — a write may slip through, a read is never blocked. It is a guard, not a permission system.
export function bashTouchesProtected(cmd, protectedPaths) {
  const text = String(cmd ?? '');
  const targets = [];

  // A redirection writes to what follows it, and to nothing else. `2>&1` names a descriptor
  // rather than a file, and the character class below declines to match it.
  for (const [, target] of text.matchAll(/\d*>>?\s*([^\s;|&]+)/g)) targets.push(target);

  // Commands whose arguments are destinations. `cp` reads its sources, so only the last argument
  // is a write; `mv` unlinks its source, so every argument is.
  for (const [, verb, rest] of text.matchAll(/\b(tee|sed|mv|cp|truncate|dd)\b([^;|&]*)/g)) {
    const args = rest.trim().split(/\s+/).filter((a) => a && !a.startsWith('-'));
    if (!args.length) continue;
    if (verb === 'tee' || verb === 'mv') targets.push(...args);
    else if (verb === 'sed') { if (/\bsed\s+-i\b/.test(text)) targets.push(...args); }
    else if (verb === 'dd' || verb === 'truncate') targets.push(...args.map((a) => a.replace(/^of=/, '')));
    else targets.push(args[args.length - 1]);
  }

  for (const p of protectedPaths) if (targets.some((t) => t.includes(p))) return p;
  return null;
}

export function bashContractBlocked(cmd, cfg) {
  if (!(cfg.guard?.require_contract ?? false)) return null;
  const writeish = /(>>?|\btee\b|\bsed\s+-i\b|\bmv\b|\bcp\b|\btruncate\b|\bdd\b)/;
  if (!writeish.test(String(cmd ?? ''))) return null;
  if (/\.aidlc\/(artifacts|state)\//.test(cmd) && !/\bsrc\/|\btests?\//.test(cmd)) return null;
  try {
    const { declared, parseError } = contractScopeState(cfg);
    if (parseError || declared.length) return null;
  } catch { return null; }
  return 'require_contract: a writeish shell command has no committed approved contract covering product files. Use the Write tool or approve a contract first.';
}

export function lockTests(cfg, { patterns = ['tests'], why = 'bug fix in progress' } = {}) {
  mkdirSync(cfg.layout.state, { recursive: true });
  const file = path.join(cfg.layout.state, 'test-lock.json');
  writeFileSync(file, JSON.stringify({ patterns, why }, null, 2) + '\n');
  return file;
}

export function clearLock(cfg) {
  const file = path.join(cfg.layout.state, 'test-lock.json');
  if (existsSync(file)) rmSync(file);
  return file;
}

export function bandTier(b) {
  if (!b || !Number.isFinite(b.observed)) throw new Error('each band requires metric and numeric observed');
  if (Number.isFinite(b.mean) && Number.isFinite(b.stdev) && b.stdev > 0) {
    const z = Math.abs((b.observed - b.mean) / b.stdev);
    if (z >= 3) return 3;
    if (z >= 2) return 2;
    if (z >= 1) return 1;
    return 0;
  }
  const breach = (Number.isFinite(b.min) && b.observed < b.min) || (Number.isFinite(b.max) && b.observed > b.max);
  return breach ? 3 : 0;
}

export function classifyBands(document) {
  if (!Array.isArray(document?.bands)) throw new Error('monitor document requires a bands array');
  const bands = document.bands.map((b) => {
    if (!b.metric || !Number.isFinite(b.observed)) throw new Error('each band requires metric and numeric observed');
    return { ...b, tier: bandTier(b) };
  });
  return {
    bands,
    log: bands.filter((b) => b.tier === 1),
    diagnose: bands.filter((b) => b.tier >= 2),
    propose: bands.filter((b) => b.tier >= 3),
  };
}

export function enterpriseChecklist(cfg) {
  const items = [
    { id: 'managed-settings', ok: false, detail: 'Managed settings must be pushed from the admin console or MDM. Git .claude/settings.json is bypassable.' },
    { id: 'production-approval', ok: cfg.deployment?.production_requires_approval !== false, detail: '[deployment].production_requires_approval must stay true.' },
    { id: 'require-contract', ok: true, detail: `[guard].require_contract is ${cfg.guard?.require_contract ? 'on' : 'off'}. Keep it on so product files need a committed approved contract.` },
    { id: 'review-policy', ok: existsSync(cfg.layout.reviewPolicy), detail: '.aidlc/policies/review.md is the review policy the packet prepends.' },
    { id: 'monitoring', ok: Array.isArray(cfg.monitoring?.collect) && cfg.monitoring.collect.length > 0, detail: Array.isArray(cfg.monitoring?.collect) && cfg.monitoring.collect.length ? `[monitoring].collect is ${cfg.monitoring.collect.join(' ')}` : '[monitoring].collect is empty — detect no-ops until a collector is configured.' },
  ];
  return items;
}
