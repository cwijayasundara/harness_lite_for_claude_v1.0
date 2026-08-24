// The predictability guarantee, made testable.
//
// plan.md names the files it will touch. This compares the working diff against that list.
// When they disagree the agent must either update the plan in the same commit or explain.
// Roughly 40 lines, and worth more determinism than any amount of spec ceremony.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { declaredFiles } from '../lib/guard.mjs';

function currentPlan(cfg) {
  const dir = cfg.layout.plan;
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'))
    .map((f) => ({ f, m: Date.parse(execSync(`git log -1 --format=%cI -- ${JSON.stringify(path.join(dir, f))}`, { cwd: cfg.layout.root, encoding: 'utf8' }).trim() || 0) || 0 }))
    .sort((a, b) => b.m - a.m);
  return files.length ? path.join(dir, files[0].f) : null;
}

export async function run(cfg) {
  const planPath = currentPlan(cfg);
  if (!planPath) return { verdict: 'skipped', findings: [], note: 'no plan in .claude/artifacts/plan/' };
  const declared = declaredFiles(readFileSync(planPath, 'utf8'));
  if (!declared) return { verdict: 'skipped', findings: [], note: `${path.basename(planPath)} has no "## Files" block` };

  let changed = [];
  try {
    changed = execSync('git diff --name-only HEAD', { cwd: cfg.layout.root, encoding: 'utf8' }).split('\n').filter(Boolean);
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
