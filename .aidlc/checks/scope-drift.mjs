// The predictability guarantee, made testable.
//
// The delivery contract owns exact paths. This compares the working diff against that scope.
// Legacy plans are read only so an in-flight pre-v1 change can migrate without a flag day.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { declaredFiles } from '../lib/guard.mjs';
import { ownedFiles, validateContract } from '../lib/contract.mjs';

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
  const surfaces = [
    { kind: 'contract', dir: cfg.layout.contracts },
    { kind: 'legacy-plan', dir: cfg.layout.plan },
  ].filter((surface) => surface.dir && existsSync(surface.dir));
  const rows = surfaces.flatMap(({ kind, dir }) => readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const abs = path.join(dir, f); const rel = path.relative(cfg.layout.root, abs);
    return { kind, f, abs, rel, dirty: dirty(cfg.layout.root, rel), m: age(cfg.layout.root, abs, rel) };
  }));
  const pool = rows.filter((r) => r.dirty);
  const ranked = (pool.length ? pool : rows).sort((a, b) => b.m - a.m);
  return ranked[0] ?? null;
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
  if (artifact.kind === 'contract') {
    const validation = validateContract(cfg.layout.root, artifact.abs);
    if (!validation.ok || validation.meta.plan_status !== 'approved') return {
      verdict: 'fail', findings: [{ file: artifact.rel, line: 0, rule: 'contract-invalid', message: validation.issues.join('; ') || 'contract plan is not approved', fix: 'validate and approve the delivery contract before implementation' }],
    };
  }
  const declared = artifact.kind === 'contract' ? ownedFiles(body) : declaredFiles(body);
  if (!declared?.length) return { verdict: 'fail', findings: [{ file: artifact.rel, line: 0, rule: 'delivery-scope-missing', message: `${artifact.f} declares no owned files`, fix: artifact.kind === 'contract' ? 'add exact paths under "## Structure and ownership"' : 'add a fenced "## Files" block' }] };

  let changed = [];
  try {
    changed = changedFiles(cfg.layout.root);
  } catch { return { verdict: 'skipped', findings: [], note: 'not a git repo' }; }

  const ignore = (f) => f.startsWith('.aidlc/artifacts/') || f.startsWith('.aidlc/state/');
  const matches = (f) => declared.some((d) => f === d || f.startsWith(d.replace(/\/$/, '') + '/'));
  const findings = changed.filter((f) => !ignore(f) && !matches(f)).map((f) => ({
    file: f, line: 0, rule: 'scope-drift',
    message: `changed but not named in ${artifact.rel}`,
    fix: artifact.kind === 'contract' ? 'amend and re-approve the contract scope, or revert the change' : 'add the file to the plan\'s "## Files" block in this same commit, or revert the change',
  }));
  return { verdict: findings.length ? 'fail' : 'pass', findings };
}
