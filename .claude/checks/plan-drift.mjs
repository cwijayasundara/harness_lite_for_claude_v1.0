// The predictability guarantee, made testable.
//
// plan.md names the files it will touch. This compares the working diff against that list.
// When they disagree the agent must either update the plan in the same commit or explain.
// Roughly 40 lines, and worth more determinism than any amount of spec ceremony.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { declaredFiles } from '../lib/guard.mjs';

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

// The plan being written in this change, not the last one git happens to have committed.
// "Update the plan in the same commit" is a lie if an untracked plan.md is invisible.
function currentPlan(cfg) {
  const dir = cfg.layout.plan;
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir).filter((f) => f.endsWith('.md'));
  const rows = names.map((f) => {
    const abs = path.join(dir, f);
    const rel = path.relative(cfg.layout.root, abs);
    return { f, abs, rel, dirty: dirty(cfg.layout.root, rel), m: age(cfg.layout.root, abs, rel) };
  });
  const pool = rows.filter((r) => r.dirty);
  const ranked = (pool.length ? pool : rows).sort((a, b) => b.m - a.m);
  return ranked.length ? ranked[0].abs : null;
}

function changedFiles(root) {
  const tracked = git(root, 'diff --name-only HEAD').split('\n');
  const untracked = git(root, 'ls-files --others --exclude-standard').split('\n');
  return [...new Set([...tracked, ...untracked])].filter(Boolean);
}

export async function run(cfg) {
  const planPath = currentPlan(cfg);
  if (!planPath) return { verdict: 'skipped', findings: [], note: 'no plan in .claude/artifacts/plan/' };
  const declared = declaredFiles(readFileSync(planPath, 'utf8'));
  if (!declared) return { verdict: 'skipped', findings: [], note: `${path.basename(planPath)} has no "## Files" block` };

  let changed = [];
  try {
    changed = changedFiles(cfg.layout.root);
  } catch { return { verdict: 'skipped', findings: [], note: 'not a git repo' }; }

  const ignore = (f) => f.startsWith('.claude/artifacts/') || f.startsWith('.claude/state/');
  const matches = (f) => declared.some((d) => f === d || f.startsWith(d.replace(/\/$/, '') + '/'));
  const findings = changed.filter((f) => !ignore(f) && !matches(f)).map((f) => ({
    file: f, line: 0, rule: 'plan-drift',
    message: `changed but not named in ${path.relative(cfg.layout.root, planPath)}`,
    fix: 'add the file to the plan\'s "## Files" block in this same commit, or revert the change',
  }));
  return { verdict: findings.length ? 'fail' : 'pass', findings };
}
