// The playbook asks that alignment between the diff and the plan be measured. This enforces it:
// a changed file that no approved committed plan claims is a finding.
//
// lean-v2 B5 moved ownership to `## Files` in `plan.md`. It used to live in a contract section
// called `## Structure and ownership`, and the plan's hand-written list was checked against a
// diff the tooling could already compute — which is how ten of twenty-three contracts came to be
// re-sealed for a missing line. One source now, in the artifact a human approved.
//
// a-plan-proves-its-spec B7 (evidence.md F25) lives here too: B2 checks, at approval, only that a
// spec's behaviours each have a Proof row — a plan may legitimately name a test it has not
// written yet. This is that promise checked at the only moment the answer is knowable, so it runs
// unconditionally, not only when the current diff happens to touch a product file.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import * as artifacts from '../lib/artifacts.mjs';

const git = (root, args) => execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).trim();

function changedFiles(root) {
  const tracked = git(root, 'diff --name-only HEAD').split('\n');
  const untracked = git(root, 'ls-files --others --exclude-standard').split('\n');
  return [...new Set([...tracked, ...untracked])].filter(Boolean);
}

const under = (file, owned) => file === owned || file.startsWith(owned.replace(/\/$/, '') + '/');

// B7: for every plan this repository's approval currently governs, each Proof row naming a test
// file must name one that exists. Presence-only rows (B2's bar) and prose evidence are not this
// check's business — `testRowIn` returns null for those, same as `behavioursHaveTests` already
// relies on.
function unkeptProof(cfg, plans) {
  const findings = [];
  for (const plan of plans) {
    const body = artifacts.read(cfg, plan.slug, 'plan')?.body ?? '';
    for (const [behaviour, evidence] of artifacts.proofRowsOf(body)) {
      const row = artifacts.testRowIn(evidence);
      if (!row || existsSync(path.join(cfg.layout.root, row.file))) continue;
      findings.push({
        file: `.aidlc/artifacts/${plan.slug}/plan.md`, line: 0, rule: 'unkept-proof',
        message: `${behaviour}: proof row names "${row.file}", which does not exist`,
        fix: `write ${row.file} with the test it promises, or correct the Proof row and re-approve the plan`,
      });
    }
  }
  return findings;
}

export async function run(cfg) {
  let changed = [];
  try { changed = changedFiles(cfg.layout.root); }
  catch { return { verdict: 'skipped', findings: [], note: 'not a git repo' }; }

  const plans = artifacts.governingPlans(cfg);
  const proofFindings = unkeptProof(cfg, plans);

  // The artifacts themselves are always writable. A gate you cannot draft is not a gate.
  const ignore = (f) => f.startsWith('.aidlc/artifacts/') || f.startsWith('.aidlc/state/');
  const product = changed.filter((f) => !ignore(f));
  if (!product.length) {
    return proofFindings.length ? { verdict: 'fail', findings: proofFindings } : { verdict: 'pass', findings: [] };
  }

  // Approved, committed, and unchanged since approval. An uncommitted approval is not an
  // auditable gate, and an approved plan whose body has since been edited is a stale approval —
  // `governingPlans` drops both, so a plan cannot widen its own scope after the fact.
  const owned = [...new Set(plans.flatMap((p) => p.owns))];

  // a-diff-belongs-to-one-change B5. `governingPlans` is the current change's plan or nothing,
  // so an empty list has two causes and they need different remedies: no open change has an
  // approved spec, or the current change's plan is not approved. Sending the agent to approve a
  // plan in the first case approves a plan for a change that is not current.
  if (!plans.length) {
    const current = artifacts.currentChange(cfg);
    const finding = current
      ? {
          rule: 'no-approved-plan',
          message: `changed under the current change "${current.slug}", whose plan is not approved (${current.planState})`,
          fix: `harness approve ${current.slug} plan --by <you> and commit, or close "${current.slug}" if that work is done`,
        }
      : {
          rule: 'no-current-change',
          message: 'changed with no current change — no open change has an approved spec',
          fix: 'harness approve <slug> spec --by <you>, then plan, and commit each',
        };
    return { verdict: 'fail', findings: [...product.map((f) => ({ file: f, line: 0, ...finding })), ...proofFindings] };
  }

  // A plan that claims nothing governs nothing, and would silently authorise the whole tree.
  const empty = plans.filter((p) => !p.owns.length).map((p) => ({
    file: `.aidlc/artifacts/${p.slug}/plan.md`, line: 0, rule: 'plan-scope-missing',
    message: 'an approved plan declares no owned files',
    fix: 'list every path this change may touch, in backticks, under "## Files"',
  }));
  if (empty.length) return { verdict: 'fail', findings: [...empty, ...proofFindings] };

  const findings = [
    ...product
      .filter((f) => !owned.some((d) => under(f, d)))
      .map((f) => ({
        file: f, line: 0, rule: 'scope-drift',
        message: `changed but not named by the current change "${plans[0].slug}" — its plan's ## Files does not claim it`,
        fix: `add the path to "## Files" of ${plans[0].slug}/plan.md and re-approve it, or revert the change`,
      })),
    ...proofFindings,
  ];

  return { verdict: findings.length ? 'fail' : 'pass', findings };
}
