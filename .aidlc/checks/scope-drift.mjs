// The playbook asks that alignment between the diff and the plan be measured. This enforces it:
// a changed file that no approved committed plan claims is a finding.
//
// lean-v2 B5 moved ownership to `## Files` in `plan.md`. It used to live in a contract section
// called `## Structure and ownership`, and the plan's hand-written list was checked against a
// diff the tooling could already compute — which is how ten of twenty-three contracts came to be
// re-sealed for a missing line. One source now, in the artifact a human approved.

import { execSync } from 'node:child_process';
import * as artifacts from '../lib/artifacts.mjs';

const git = (root, args) => execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).trim();

function changedFiles(root) {
  const tracked = git(root, 'diff --name-only HEAD').split('\n');
  const untracked = git(root, 'ls-files --others --exclude-standard').split('\n');
  return [...new Set([...tracked, ...untracked])].filter(Boolean);
}

const under = (file, owned) => file === owned || file.startsWith(owned.replace(/\/$/, '') + '/');

export async function run(cfg) {
  let changed = [];
  try { changed = changedFiles(cfg.layout.root); }
  catch { return { verdict: 'skipped', findings: [], note: 'not a git repo' }; }

  // The artifacts themselves are always writable. A gate you cannot draft is not a gate.
  const ignore = (f) => f.startsWith('.aidlc/artifacts/') || f.startsWith('.aidlc/state/');
  const product = changed.filter((f) => !ignore(f));
  if (!product.length) return { verdict: 'pass', findings: [] };

  // Approved, committed, and unchanged since approval. An uncommitted approval is not an
  // auditable gate, and an approved plan whose body has since been edited is a stale approval —
  // `governingPlans` drops both, so a plan cannot widen its own scope after the fact.
  const plans = artifacts.governingPlans(cfg);
  const owned = [...new Set(plans.flatMap((p) => p.owns))];

  if (!plans.length) {
    return {
      verdict: 'fail',
      findings: product.map((f) => ({
        file: f, line: 0, rule: 'no-approved-plan',
        message: 'changed with no approved committed plan governing this repository',
        fix: 'harness approve <slug> spec --by <you>, then plan, and commit each',
      })),
    };
  }

  // A plan that claims nothing governs nothing, and would silently authorise the whole tree.
  const empty = plans.filter((p) => !p.owns.length).map((p) => ({
    file: `.aidlc/artifacts/${p.slug}/plan.md`, line: 0, rule: 'plan-scope-missing',
    message: 'an approved plan declares no owned files',
    fix: 'list every path this change may touch, in backticks, under "## Files"',
  }));
  if (empty.length) return { verdict: 'fail', findings: empty };

  const findings = product
    .filter((f) => !owned.some((d) => under(f, d)))
    .map((f) => ({
      file: f, line: 0, rule: 'scope-drift',
      message: `changed but claimed by no approved plan (${plans.map((p) => p.slug).join(', ')})`,
      fix: 'add the path to "## Files" and re-approve the plan, or revert the change',
    }));

  return { verdict: findings.length ? 'fail' : 'pass', findings };
}
