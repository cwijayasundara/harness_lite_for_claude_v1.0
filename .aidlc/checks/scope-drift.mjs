// The predictability guarantee, made testable.
//
// The delivery contract owns exact paths. This compares the working diff against that scope.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { isCommitted, ownedFiles, validateContract } from '../lib/contract.mjs';

function git(root, args) {
  return execSync(`git ${args}`, { cwd: root, encoding: 'utf8' });
}

function dirty(root, rel) {
  try {
    return git(root, `status --porcelain -- ${JSON.stringify(rel)}`).trim().length > 0;
  } catch { return false; }
}

function age(root, abs, rel) {
  let committed = 0;
  try { committed = Date.parse(git(root, `log -1 --format=%cI -- ${JSON.stringify(rel)}`).trim()) || 0; } catch { /* untracked */ }
  let mtime = 0;
  try { mtime = statSync(abs).mtimeMs; } catch { /* missing */ }
  return Math.max(committed, mtime);
}

// Prefer the contract being written in this change, not the last committed artifact.
function currentDeliveryArtifact(cfg) {
  const dir = cfg.layout.contracts;
  if (!dir || !existsSync(dir)) return null;
  const rows = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const abs = path.join(dir, f); const rel = path.relative(cfg.layout.root, abs);
    return { f, abs, rel, dirty: dirty(cfg.layout.root, rel), m: age(cfg.layout.root, abs, rel) };
  });
  const pool = rows.filter((r) => r.dirty);
  const ranked = (pool.length ? pool : rows).sort((a, b) => b.m - a.m);
  return ranked[0] ?? null;
}

// Ownership is a property of the repository, not of whichever contract was edited last.
//
// This function and `currentDeliveryArtifact` answer two different questions that the check used
// to conflate: "what is owned" and "which contract is being written now". Reading ownership off
// the single most-recently-modified contract made the check disagree with the write guard —
// `contractScopeState` in guard.mjs has always unioned across every approved committed contract,
// and CLAUDE.md states that rule: a product file edit needs a committed approved contract that
// owns the path. Recording `evals/expected.json`, owned by `eval-ratchet`, failed because
// `recalibrate-eval-budgets` happened to have a newer mtime.
//
// Same validity bar as the guard: valid, plan approved, and committed. An uncommitted approval
// is not an auditable gate.
function ownedByAnyContract(cfg) {
  const dir = cfg.layout?.contracts;
  if (!dir || !existsSync(dir)) return [];
  const owned = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const file = path.join(dir, name);
    try {
      const validation = validateContract(cfg.layout.root, file);
      if (!validation.ok || validation.meta.plan_status !== 'approved' || !isCommitted(cfg.layout.root, file)) continue;
      for (const owns of ownedFiles(readFileSync(file, 'utf8')) ?? []) owned.push({ path: owns, contract: name });
    } catch { /* a contract that cannot be read owns nothing; the in-flight check reports it */ }
  }
  return owned;
}

function changedFiles(root) {
  const tracked = git(root, 'diff --name-only HEAD').split('\n');
  const untracked = git(root, 'ls-files --others --exclude-standard').split('\n');
  return [...new Set([...tracked, ...untracked])].filter(Boolean);
}

export async function run(cfg) {
  const artifact = currentDeliveryArtifact(cfg);
  if (!artifact) return { verdict: 'skipped', findings: [], note: 'no delivery contract' };
  const body = readFileSync(artifact.abs, 'utf8');
  const validation = validateContract(cfg.layout.root, artifact.abs);
  if (!validation.ok || validation.meta.plan_status !== 'approved') return {
    verdict: 'fail', findings: [{ file: artifact.rel, line: 0, rule: 'contract-invalid', message: validation.issues.join('; ') || 'contract plan is not approved', fix: 'validate and approve the delivery contract before implementation' }],
  };
  const inFlight = ownedFiles(body);
  if (!inFlight?.length) return { verdict: 'fail', findings: [{ file: artifact.rel, line: 0, rule: 'delivery-scope-missing', message: `${artifact.f} declares no owned files`, fix: 'add exact paths under "## Structure and ownership"' }] };

  // What is owned: every approved *committed* contract, and nothing else. The same bar the write
  // guard applies, which is the point — the guard already refuses product edits until the
  // contract is committed, so by the time code changes exist the contract is in history. An
  // in-flight uncommitted contract granting itself scope would let the check pass on an approval
  // no reviewer can see.
  const declared = [...new Set(ownedByAnyContract(cfg).map((o) => o.path))];

  let changed = [];
  try {
    changed = changedFiles(cfg.layout.root);
  } catch { return { verdict: 'skipped', findings: [], note: 'not a git repo' }; }

  const ignore = (f) => f.startsWith('.aidlc/artifacts/') || f.startsWith('.aidlc/state/');
  const matches = (f) => declared.some((d) => f === d || f.startsWith(d.replace(/\/$/, '') + '/'));
  const findings = changed.filter((f) => !ignore(f) && !matches(f)).map((f) => ({
    file: f, line: 0, rule: 'scope-drift',
    message: `changed but owned by no approved contract (in flight: ${artifact.rel})`,
    fix: 'amend and re-approve the contract scope, or revert the change',
  }));
  return { verdict: findings.length ? 'fail' : 'pass', findings };
}
