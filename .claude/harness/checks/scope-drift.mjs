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

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as artifacts from '../lib/artifacts.mjs';
import { gateBlocks } from '../lib/config.mjs';
import { changedFiles, diff, git, unbornRepository, TEST_FILE } from '../lib/diff.mjs';

const under = (file, owned) => file === owned || file.startsWith(owned.replace(/\/$/, '') + '/');

// G06. Each finding says which gate it belongs to, and the gate's mode decides whether this
// control fails the stage or annotates it. One verdict per control, so a blocking finding wins:
// `unkept-proof` carries no gate at all — an approved plan naming a test that does not exist is
// a broken promise in a gate that was already given, not a gate still waiting for an answer, and
// no mode relaxes it.
function verdictFor(cfg, findings) {
  if (!findings.length) return 'pass';
  const blocking = findings.some((f) => !f.gate || gateBlocks(cfg, f.gate));
  return blocking ? 'fail' : 'warn';
}

// The gate tag is internal routing, not part of the finding schema the report renders and the
// normalisers fill. Stripped once the verdict is computed so `render` and the ledger see exactly
// the shape they saw before this change.
const shed = (findings) => findings.map(({ gate, ...f }) => f);

const graded = (cfg, findings) => ({ verdict: verdictFor(cfg, findings), findings: shed(findings) });

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
      if (!row) continue;
      let present = existsSync(path.join(cfg.layout.root, row.file));
      if (cfg.diff) {
        try { present = git(cfg.layout.root, ['cat-file', '-t', `${cfg.diff.candidate}:${row.file}`]).trim() === 'blob'; }
        catch { present = false; }
      }
      if (present) continue;
      findings.push({
        file: `.claude/harness/artifacts/${plan.slug}/plan.md`, line: 0, rule: 'unkept-proof',
        message: `${behaviour}: proof row names "${row.file}", which does not exist`,
        fix: `write ${row.file} with the test it promises, or correct the Proof row and re-approve the plan`,
      });
    }
  }
  return findings;
}

// why: agents produce diffs larger than anyone can review, and the size is discovered at review
// time when it is expensive to split. The approved plan states the budget; the diff is held to it.
const BUDGET_LINE = /^Diff budget:\s*(\d+)\s*lines?\s*$/mi;

export function diffBudget(cfg, planBody) {
  const declared = BUDGET_LINE.exec(planBody ?? '');
  return declared ? Number(declared[1]) : Number(cfg?.budget?.max_diff_lines ?? 400);
}

// Added plus deleted lines in non-test files. Binary files are not lines of code. Untracked files
// (local checks only) are absent from numstat and count as all-added.
function countChangedLines(cfg, files) {
  const pending = new Set(files.filter((f) => !TEST_FILE.test(f)));
  let total = 0;
  for (const row of diff(cfg, ['--numstat', '-z']).split('\0')) {
    const [added, deleted, file] = row.split('\t');
    if (!pending.has(file)) continue;
    pending.delete(file);
    if (added !== '-') total += Number(added) + Number(deleted);
  }
  if (cfg.diff) return total;
  for (const file of pending) {
    const full = path.join(cfg.layout.root, file);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, 'utf8');
    if (text.includes('\0')) continue;
    total += text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  }
  return total;
}

export async function run(cfg) {
  if (unbornRepository(cfg)) return { verdict: 'skipped', findings: [], note: 'no commits yet; local scope requires HEAD' };
  const changed = changedFiles(cfg);

  const plans = artifacts.governingPlans(cfg);
  const proofFindings = unkeptProof(cfg, plans);

  // The artifacts themselves are always writable. A gate you cannot draft is not a gate.
  // CODEBASE-MAP.md is harness output, regenerated by the Stop hook (every-control-fires-or-goes
  // B5); no plan should have to claim what the harness writes.
  const ignore = (f) => f.startsWith('.claude/harness/artifacts/') || f.startsWith('.claude/harness/state/') || f === 'CODEBASE-MAP.md';
  const product = changed.filter((f) => !ignore(f));
  if (!product.length && !cfg.diff) {
    return graded(cfg, proofFindings);
  }

  // Approved, committed, and unchanged since approval. An uncommitted approval is not an
  // auditable gate, and an approved plan whose body has since been edited is a stale approval —
  // `governingPlans` drops both, so a plan cannot widen its own scope after the fact.
  const owned = [...new Set(plans.flatMap((p) => p.owns))];

  // Distinguish unavailable selection from the selected change's own pending gate.
  if (!plans.length) {
    const current = artifacts.currentChange(cfg);
    const drafts = artifacts.draftsAwaitingGate(cfg);
    // a-draft-is-a-declaration B3: a written, unapproved spec is work declared and not gated.
    const finding = drafts.length
      ? {
          gate: drafts[0].kind === 'plan' ? 'plan' : 'spec',
          rule: 'draft-awaits-gate',
          message: `changed while ${artifacts.awaitingGateLine(drafts[0]).replace(/^awaiting/, 'awaiting')}${drafts.length > 1 ? ` (also: ${drafts.slice(1).map((d) => `${d.slug}/${d.kind}.md`).join(', ')})` : ''} — ${drafts[0].slug}/${drafts[0].kind}.md`,
          fix: artifacts.awaitingGateRemedy(drafts[0]),
        }
      : current
      ? {
          gate: 'plan',
          rule: 'no-approved-plan',
          message: `changed under the current change "${current.slug}" — ${artifacts.currentLine(cfg)}`,
          fix: artifacts.currentLine(cfg),
        }
      : {
          // Nothing is selected, so nothing has reached gate 2 yet: gate 1 is what is missing.
          gate: 'spec',
          rule: 'no-current-change',
          message: `changed with no executable selection — ${artifacts.currentLine(cfg)}`,
          fix: 'harness status --change <slug>; approve its spec and plan and commit each',
        };
    return graded(cfg, [...(product.length ? product : ['.claude/harness/artifacts/']).map((f) => ({ file: f, line: 0, ...finding })), ...proofFindings]);
  }

  // A plan that claims nothing governs nothing, and would silently authorise the whole tree.
  const empty = plans.filter((p) => !p.owns.length).map((p) => ({
    file: `.claude/harness/artifacts/${p.slug}/plan.md`, line: 0, gate: 'plan', rule: 'plan-scope-missing',
    message: 'an approved plan declares no owned files',
    fix: 'list every path this change may touch, in backticks, under "## Files"',
  }));
  if (empty.length) return graded(cfg, [...empty, ...proofFindings]);

  const findings = [
    ...product
      .filter((f) => !owned.some((d) => under(f, d)))
      .map((f) => ({
        file: f, line: 0, gate: 'plan', rule: 'scope-drift',
        message: `changed but not named by the current change "${plans[0].slug}" — its plan's ## Files does not claim it`,
        fix: `add the path to "## Files" of ${plans[0].slug}/plan.md and re-approve it, or revert the change`,
      })),
    ...proofFindings,
  ];

  const planPath = `.claude/harness/artifacts/${plans[0].slug}/plan.md`;
  const budget = diffBudget(cfg, artifacts.read(cfg, plans[0].slug, 'plan')?.body);
  const changedLines = countChangedLines(cfg, product);
  if (changedLines > budget) findings.push({
    file: planPath, line: 0, gate: 'plan', rule: 'diff-budget',
    message: `${changedLines} changed non-test lines exceed the diff budget of ${budget}`,
    fix: `split the change into smaller slices, or declare "Diff budget: <N> lines" in ${plans[0].slug}/plan.md with the reason and re-approve it`,
  });

  return graded(cfg, findings);
}
