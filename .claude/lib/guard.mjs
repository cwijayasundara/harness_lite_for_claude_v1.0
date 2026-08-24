import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PREFIX_CACHE_PATHS } from './paths.mjs';

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

function statusApproved(text) {
  return /^- \*\*Status:\*\*\s*approved\b/mi.test(String(text ?? ''));
}

function plannedState(cfg) {
  const dir = cfg.layout?.plan;
  if (!dir || !existsSync(dir)) return { declared: [], parseError: false };
  const declared = [];
  let parseError = false;
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    try {
      const text = readFileSync(path.join(dir, name), 'utf8');
      if (!statusApproved(text)) continue;
      const files = declaredFiles(text);
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
  return rel.startsWith('.claude/artifacts/') || rel.startsWith('.claude/state/');
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
        if (pat && norm.includes(pat)) return `${norm} is test-locked because ${why}. Fix the code, not the test. Run: node .claude/bin/harness lock clear`;
      }
    } catch { /* a malformed lock must not block work */ }
  }
  if (cfg.guard?.require_plan && !artifactOrState(norm)) {
    try {
      const { declared, parseError } = plannedState(cfg);
      if (parseError && !declared.length) return null;
      if (!declared.length) return `${norm} needs an approved plan before product files change. Write and approve plan.md, or set [guard].require_plan = false.`;
      if (!matchesDeclared(norm, declared)) return `${norm} is not named in an approved plan's ## Files block.`;
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

export function bashTouchesProtected(cmd, protectedPaths) {
  const writeish = /(>>?|\btee\b|\bsed\s+-i\b|\bmv\b|\bcp\b|\btruncate\b|\bdd\b)/;
  if (!writeish.test(cmd)) return null;
  for (const p of protectedPaths) if (cmd.includes(p)) return p;
  return null;
}

export function bashPlanBlocked(cmd, cfg) {
  if (!cfg.guard?.require_plan) return null;
  const writeish = /(>>?|\btee\b|\bsed\s+-i\b|\bmv\b|\bcp\b|\btruncate\b|\bdd\b)/;
  if (!writeish.test(String(cmd ?? ''))) return null;
  if (/\.claude\/(artifacts|state)\//.test(cmd) && !/\bsrc\/|\btests?\//.test(cmd)) return null;
  try {
    const { declared, parseError } = plannedState(cfg);
    if (parseError || declared.length) return null;
  } catch { return null; }
  return 'require_plan: a writeish shell command has no approved plan covering product files. Use the Write tool or approve a plan first.';
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
    { id: 'require-plan', ok: true, detail: `[guard].require_plan is ${cfg.guard?.require_plan ? 'on' : 'off (default)'}. Turn it on in a product repo so product files need an approved plan.` },
    { id: 'review-policy', ok: existsSync(path.join(cfg.layout.claude, 'REVIEW.md')), detail: '.claude/REVIEW.md is the review policy the packet prepends.' },
    { id: 'monitoring', ok: Array.isArray(cfg.monitoring?.collect) && cfg.monitoring.collect.length > 0, detail: Array.isArray(cfg.monitoring?.collect) && cfg.monitoring.collect.length ? `[monitoring].collect is ${cfg.monitoring.collect.join(' ')}` : '[monitoring].collect is empty — detect no-ops until a collector is configured.' },
  ];
  return items;
}
