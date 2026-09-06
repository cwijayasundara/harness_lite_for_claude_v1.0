// Campaign assertions: pure functions over a staged working copy, no model, no spend. If this
// file is green, a multi-sprint eval that names these checks is grading something real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, cpSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unseenRequirements, modifiedNotReplaced, behavioursHaveTests, diffOwnedByCurrentChange } from '../evals/lib/campaign.mjs';
import { render, bodyDigest } from '../.aidlc/lib/artifacts.mjs';
import { evaluate, KNOWN } from '../evals/lib/assertions.mjs';
import { runSuite } from '../evals/run.mjs';
import { stage } from '../evals/lib/stage.mjs';
import { A, ROOT } from './_paths.mjs';

const FIXTURES = path.join(ROOT, 'evals', 'fixtures');
const HARNESS = path.join(A, 'bin', 'harness');

function dir() {
  const root = mkdtempSync(path.join(tmpdir(), 'campaign-'));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// Every step of both campaigns opens with { "harness_stage_passes": "stop" }, and `runAttempt`
// breaks the step loop on the first failing assertion — so a fixture that cannot pass its own
// first assertion terminates the campaign at step 0 and produces no evidence for anything past
// it. This is the reproduction the review used: the real repo's harness binary (not the shim
// written into the staged copy, which is a shell script) against a freshly staged, untouched
// fixture — sprint 0, before any model runs.
test('campaign-ledger passes harness check --stage stop as staged, before any sprint runs', () => {
  const s = stage(FIXTURES, 'campaign-ledger');
  try {
    const r = spawnSync('node', [HARNESS, 'check', '--stage', 'stop'], { cwd: s.work, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally { s.cleanup(); }
});

// one-integration-test B1 and B8. One fixture, brownfield: working code, one smoke test, a file
// with a deliberate defect no sprint asks about, notes, and no artifact chain. And one campaign:
// `campaign-legacy` is gone, and nothing else has steps.
test('the ledger remains brownfield and product campaigns are separate from golden tasks', () => {
  const s = stage(FIXTURES, 'campaign-ledger');
  try {
    for (const f of ['NOTES.md', 'src/ledger.mjs', 'src/fees.mjs', 'tests/smoke.test.mjs', '.aidlc/harness.toml']) {
      assert.ok(existsSync(path.join(s.work, f)), `${f} missing from the staged fixture`);
    }
    // `harness init` creates the empty directory when staging; what must be absent is a change.
    const artifacts = path.join(s.work, '.aidlc/artifacts');
    const changes = existsSync(artifacts) ? readdirSync(artifacts).filter((d) => existsSync(path.join(artifacts, d, 'intent.md'))) : [];
    assert.deepEqual(changes, [], 'a brownfield fixture has no change yet');
    const ledger = readFileSync(path.join(s.work, 'src/ledger.mjs'), 'utf8');
    for (const fn of ['addCustomer', 'addInvoice', 'listInvoices']) assert.match(ledger, new RegExp(`export function ${fn}`));
    for (const fn of ['outstandingBalance', 'isOverdue']) assert.doesNotMatch(ledger, new RegExp(fn), `${fn} is sprint 1's job`);
  } finally { s.cleanup(); }
  assert.ok(!existsSync(path.join(FIXTURES, 'campaign-legacy')));
  const tasks = JSON.parse(readFileSync(path.join(ROOT, 'evals', 'tasks.json'), 'utf8')).tasks;
  const campaigns = tasks.filter((t) => t.steps);
  assert.deepEqual(campaigns, [], 'retired transcript-driven campaign is not a golden task');
  const products=JSON.parse(readFileSync(path.join(ROOT,'evals/products.json'),'utf8')).tasks;
  assert.deepEqual(products.map(t=>t.id),['campaign-ledger','campaign-service']);
  assert.equal(products[0].steps.length,5);
  assert.equal(products[1].steps.length,6);
});

// B2. A later sprint's requirement must not be reachable before its own step runs. Asserted
// structurally: the text must not appear anywhere in the working copy.
test('unseenRequirements fires when a later prompt is planted in the working copy', () => {
  const d = dir();
  try {
    mkdirSync(path.join(d.root, 'src'), { recursive: true });
    writeFileSync(path.join(d.root, 'src/app.js'), 'export const x = 1;\n');
    const clean = unseenRequirements(d.root, ['partial payments']);
    assert.equal(clean.ok, true, clean.violations.join('; '));
    assert.deepEqual(clean.violations, []);

    writeFileSync(path.join(d.root, 'src/app.js'), '// TODO: support partial payments later\n');
    const planted = unseenRequirements(d.root, ['partial payments']);
    assert.equal(planted.ok, false);
    assert.match(planted.violations.join(';'), /partial payments/);
  } finally { d.cleanup(); }
});

test('unseenRequirements does not fire on requirement text that never leaked, and ignores .git', () => {
  const d = dir();
  try {
    mkdirSync(path.join(d.root, '.git'), { recursive: true });
    writeFileSync(path.join(d.root, '.git/COMMIT_EDITMSG'), 'a paid invoice must never appear as overdue\n');
    writeFileSync(path.join(d.root, 'notes.md'), 'sprint 1 covers customers and invoices.\n');
    const r = unseenRequirements(d.root, ['a paid invoice must never appear as overdue']);
    assert.equal(r.ok, true, 'a match inside .git is not a leak into the working copy');
  } finally { d.cleanup(); }
});

// B4. An edit keeps the earlier proof; a deletion-and-rewrite drops it even though the file is
// still there, still has a name, and still asserts something.
test('modifiedNotReplaced distinguishes an edited test file from a deleted-and-rewritten one', () => {
  const d = dir();
  try {
    const file = 'tests/test_ledger.js';
    mkdirSync(path.join(d.root, 'tests'), { recursive: true });
    writeFileSync(path.join(d.root, file),
      "test('test_outstanding_balance_sums_invoices', () => {});\n" +
      "test('test_partial_payment_reduces_balance', () => {});\n");
    const edited = modifiedNotReplaced(d.root, file, ['test_outstanding_balance_sums_invoices']);
    assert.equal(edited.ok, true, edited.violations.join('; '));

    writeFileSync(path.join(d.root, file), "test('test_totally_different_name', () => {});\n");
    const replaced = modifiedNotReplaced(d.root, file, ['test_outstanding_balance_sums_invoices']);
    assert.equal(replaced.ok, false);
    assert.match(replaced.violations.join(';'), /test_outstanding_balance_sums_invoices/);

    rmSync(path.join(d.root, file));
    const deleted = modifiedNotReplaced(d.root, file, ['test_outstanding_balance_sums_invoices']);
    assert.equal(deleted.ok, false);
    assert.match(deleted.violations.join(';'), /no longer exists/);
  } finally { d.cleanup(); }
});

test('CHECKS registers modified_not_replaced and it reads ctx.work', () => {
  assert.ok(KNOWN.includes('modified_not_replaced'));
  const d = dir();
  try {
    writeFileSync(path.join(d.root, 'kept.txt'), 'the original marker text\n');
    const [r] = evaluate({ work: d.root }, [{ modified_not_replaced: { file: 'kept.txt', markers: ['original marker'] } }]);
    assert.equal(r.pass, true, r.detail);
  } finally { d.cleanup(); }
});

// The `path::identifier` shape is real — it's the pytest node-id convention
// evals/fixtures/contract-planned's plan.md actually uses — but it lives in ONE backtick span,
// not two. `` `path`::`id` `` (two spans either side of a bare "::") is not a shape anything in
// this repository writes; it was invented for the first version of these tests and is fixed here.
function artifact(root, slug, { specStatus = 'approved', behaviours, planStatus = 'approved', proofRows, evidenceRows = [] }) {
  const dir = path.join(root, '.aidlc/artifacts', slug);
  mkdirSync(dir, { recursive: true });
  const specBody = behaviours.map((b) => `### ${b}\n\nGiven, when, then.\n`).join('\n');
  writeFileSync(path.join(dir, 'spec.md'), `---\nstatus: ${specStatus}\n---\n# Spec: ${slug}\n\n## Observable behaviours\n\n${specBody}`);
  const testRows = proofRows.map(([b, file, id]) => `| ${b} | \`${file}::${id}\` |`);
  const table = [...testRows, ...evidenceRows.map(([b, text]) => `| ${b} | ${text} |`)].join('\n');
  writeFileSync(path.join(dir, 'plan.md'), `---\nstatus: ${planStatus}\n---\n# Plan: ${slug}\n\n## Proof\n\n| Behaviour | Test or evidence |\n|---|---|\n${table}\n`);
}

// B6. A behaviour without a Proof row naming a test is exactly a spec that has quietly become
// fiction — checkable without a model.
test('behavioursHaveTests fires on an approved spec whose B2 no test names', () => {
  const d = dir();
  try {
    mkdirSync(path.join(d.root, 'tests'), { recursive: true });
    writeFileSync(path.join(d.root, 'tests/test_ledger.js'), "test('test_b1_case', () => {});\n");
    artifact(d.root, 'ledger', {
      behaviours: ['B1', 'B2'],
      proofRows: [['B1', 'tests/test_ledger.js', 'test_b1_case']], // B2 has no row
    });
    const r = behavioursHaveTests(d.root);
    assert.equal(r.ok, false);
    assert.match(r.violations.join(';'), /ledger B2: plan\.md's Proof table names no row/);
  } finally { d.cleanup(); }
});

// Negative case: a test that legitimately moved. The Proof table is the source of truth for
// where evidence lives, not a hardcoded default location, so an updated row does not fire.
test('behavioursHaveTests does not fire on a test that legitimately moved', () => {
  const d = dir();
  try {
    mkdirSync(path.join(d.root, 'tests/moved'), { recursive: true });
    writeFileSync(path.join(d.root, 'tests/moved/test_ledger.js'), "test('test_b1_case', () => {});\n");
    artifact(d.root, 'ledger', {
      behaviours: ['B1'],
      proofRows: [['B1', 'tests/moved/test_ledger.js', 'test_b1_case']],
    });
    const r = behavioursHaveTests(d.root);
    assert.equal(r.ok, true, r.violations.join('; '));
  } finally { d.cleanup(); }
});

// Important 9: widened beyond `test_*`/`*.test.*` — `.spec.` (jest/jasmine), `_spec.` (rspec),
// and a directory-based convention where the file itself carries no test-shaped name at all.
test('behavioursHaveTests resolves .spec files and directory-only test conventions, not just test_*/*.test.*', () => {
  const d = dir();
  try {
    mkdirSync(path.join(d.root, 'src'), { recursive: true });
    mkdirSync(path.join(d.root, 'spec'), { recursive: true });
    writeFileSync(path.join(d.root, 'src/ledger.spec.ts'), "it('sums invoices', () => {});\n");
    writeFileSync(path.join(d.root, 'src/ledger_spec.rb'), "it 'sums invoices' do end\n");
    writeFileSync(path.join(d.root, 'spec/ledger.mjs'), "test('sums invoices', () => {});\n"); // directory convention, no test-shaped basename
    artifact(d.root, 'ledger', {
      behaviours: ['B1', 'B2', 'B3'],
      proofRows: [
        ['B1', 'src/ledger.spec.ts', "sums invoices"],
        ['B2', 'src/ledger_spec.rb', "sums invoices"],
        ['B3', 'spec/ledger.mjs', "sums invoices"],
      ],
    });
    const r = behavioursHaveTests(d.root);
    assert.equal(r.ok, true, r.violations.join('; '));
    assert.deepEqual(r.unverifiable, [], 'all three should resolve as tests, not fall through to unverifiable');
  } finally { d.cleanup(); }
});

// A genuinely unrecognised row still fails safe: unverifiable, never silently graded a pass.
test('behavioursHaveTests reports a truly unrecognised row as unverifiable rather than guessing', () => {
  const d = dir();
  try {
    artifact(d.root, 'ledger', {
      behaviours: ['B1'],
      proofRows: [],
      evidenceRows: [['B1', 'see `docs/design-notes.md` for the reasoning']],
    });
    const r = behavioursHaveTests(d.root);
    assert.equal(r.ok, true, r.violations.join('; '));
    assert.deepEqual(r.unverifiable, ['ledger B1']);
  } finally { d.cleanup(); }
});

// Negative case: a behaviour retired on purpose. Removed from spec.md, so the loop never visits
// it — retiring a behaviour is not the defect this check exists to find.
test('behavioursHaveTests does not fire on a behaviour retired on purpose', () => {
  const d = dir();
  try {
    mkdirSync(path.join(d.root, 'tests'), { recursive: true });
    writeFileSync(path.join(d.root, 'tests/test_ledger.js'), "test('test_b1_case', () => {});\n");
    // B2 was retired: spec.md lists only B1 now, even though the plan's Proof table (written
    // when B2 still existed) is not required to be rewritten just to retire a behaviour.
    artifact(d.root, 'ledger', {
      behaviours: ['B1'],
      proofRows: [['B1', 'tests/test_ledger.js', 'test_b1_case']],
    });
    const r = behavioursHaveTests(d.root);
    assert.equal(r.ok, true, r.violations.join('; '));
  } finally { d.cleanup(); }
});

// Amended B6: the plan skill explicitly permits a Proof row to name runtime evidence rather
// than a test ("manual check is only honest when the thing genuinely cannot be automated"), and
// this change's own plan does exactly that for five behaviours. A row like that is unverifiable,
// not a violation — the mechanical check has nothing to run.
test('behavioursHaveTests reports a runtime-evidence row as unverifiable, and does not fire on it', () => {
  const d = dir();
  try {
    artifact(d.root, 'ledger', {
      behaviours: ['B1'],
      proofRows: [],
      evidenceRows: [['B1', 'the `campaign-ledger` run recorded in `evidence.md`, three sprints, stop stage green after each']],
    });
    const r = behavioursHaveTests(d.root);
    assert.equal(r.ok, true, r.violations.join('; '));
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.unverifiable, ['ledger B1']);
  } finally { d.cleanup(); }
});

// Regression for the defect team-lead found: run behavioursHaveTests against rows written in
// this repository's actual house style — a backtick-quoted test file followed by free prose,
// and evidence rows that name no test file at all — and confirm none of it is misread as a
// violation. Rows lifted verbatim from .aidlc/artifacts/evolving-scope/plan.md itself.
test('behavioursHaveTests does not fire on this repository\'s real Proof-row house style', () => {
  const d = dir();
  try {
    mkdirSync(path.join(d.root, 'test'), { recursive: true });
    writeFileSync(path.join(d.root, 'test/campaign.test.mjs'), 'test that actually exists\n');
    artifact(d.root, 'evolving-scope', {
      behaviours: ['B1', 'B3', 'B9', 'B10'],
      proofRows: [],
      evidenceRows: [
        ['B1', '`test/campaign.test.mjs` — "a multi-step task runs each step against one working copy" via `runSuite` with a fake invoker'],
        ['B3', 'the `campaign-ledger` run recorded in `evidence.md`, three sprints, stop stage green after each'],
        ['B9', 'a step given a 0.01 USD ceiling records `inconclusive`, asserted in `test/campaign.test.mjs`'],
        ['B10', '`.aidlc/artifacts/evolving-scope/evidence.md` exists and every entry names a component'],
      ],
    });
    const r = behavioursHaveTests(d.root);
    assert.equal(r.ok, true, r.violations.join('; '));
    assert.deepEqual(r.violations, []);
    // B1 and B9 both name the real test file and resolve; B3 and B10 name no test file at all.
    assert.deepEqual(r.unverifiable.sort(), ['evolving-scope B10', 'evolving-scope B3'].sort());
  } finally { d.cleanup(); }
});

// `ok: true` alone does not distinguish "nothing to check" from "checked and clean" — `checked`
// does. The pure function's `ok` is unchanged by this (a draft spec still isn't a promise the
// code must keep), but a caller that cares whether anything was actually examined now can.
test('behavioursHaveTests ignores a spec that is not approved, and passes with no artifacts at all — but reports checked: 0 either way', () => {
  const d = dir();
  try {
    const empty = behavioursHaveTests(d.root);
    assert.equal(empty.ok, true, 'no .aidlc/artifacts at all');
    assert.equal(empty.checked, 0, 'nothing existed to check');
    artifact(d.root, 'draft-thing', { specStatus: 'draft', behaviours: ['B1'], proofRows: [] });
    const r = behavioursHaveTests(d.root);
    assert.equal(r.ok, true, 'a draft spec is not yet a promise the code must keep');
    assert.equal(r.checked, 0, 'a draft spec contributes nothing to check either');
  } finally { d.cleanup(); }
});

test('behavioursHaveTests counts what it actually examined', () => {
  const d = dir();
  try {
    mkdirSync(path.join(d.root, 'tests'), { recursive: true });
    writeFileSync(path.join(d.root, 'tests/test_ledger.js'), "test('test_b1_case', () => {});\n");
    artifact(d.root, 'ledger', {
      behaviours: ['B1'],
      proofRows: [['B1', 'tests/test_ledger.js', 'test_b1_case']],
    });
    assert.equal(behavioursHaveTests(d.root).checked, 1);
  } finally { d.cleanup(); }
});

test('CHECKS registers behaviours_have_tests, it reads ctx.work, and it surfaces unverifiable rows in the detail', () => {
  assert.ok(KNOWN.includes('behaviours_have_tests'));
  const d = dir();
  try {
    mkdirSync(path.join(d.root, 'tests'), { recursive: true });
    writeFileSync(path.join(d.root, 'tests/test_ledger.js'), "test('test_b1_case', () => {});\n");
    artifact(d.root, 'ledger', {
      behaviours: ['B1', 'B2'],
      proofRows: [['B1', 'tests/test_ledger.js', 'test_b1_case']],
      evidenceRows: [['B2', 'the `campaign-ledger` run recorded in `evidence.md`']],
    });
    const [r] = evaluate({ work: d.root }, [{ behaviours_have_tests: true }]);
    assert.equal(r.pass, true, r.detail);
    assert.match(r.detail, /unverifiable/, 'the unverifiable row is surfaced, not dropped');
    assert.match(r.detail, /ledger B2/);
  } finally { d.cleanup(); }
});

// Important 6, exactly as the review put it: a run in which the agent never got a spec approved
// — the failure B8 is hunting — must not pass a step that expects artifacts to exist.
test('behaviours_have_tests: true fails when nothing was checked, not passes vacuously', () => {
  const d = dir();
  try {
    const [nothingAtAll] = evaluate({ work: d.root }, [{ behaviours_have_tests: true }]);
    assert.equal(nothingAtAll.pass, false, 'no .aidlc/artifacts at all is not evidence a spec was approved');
    assert.match(nothingAtAll.detail, /no approved behaviour found to check/);

    artifact(d.root, 'draft-thing', { specStatus: 'draft', behaviours: ['B1'], proofRows: [] });
    const [draftOnly] = evaluate({ work: d.root }, [{ behaviours_have_tests: true }]);
    assert.equal(draftOnly.pass, false, 'an unapproved spec is not evidence either — B8 is exactly the case where approval never happened');
  } finally { d.cleanup(); }
});

// B1. The runner already loops `t.steps` against one working copy, evaluating each step's
// assertions before the next step's prompt is sent. No task has ever exercised that path.
test('a multi-step task runs each step against the same working copy, in order, gated by each step\'s own assertions', async () => {
  const calls = [];
  const invoke = async ({ cwd, step }) => {
    calls.push({ step, cwd, markerPresent: existsSync(path.join(cwd, 'marker-from-step-0.txt')) });
    if (step === 0) writeFileSync(path.join(cwd, 'marker-from-step-0.txt'), 'left by step 0\n');
    return { transcript: `did step ${step}`, usage: { usd: 0.01 } };
  };
  const out = await runSuite({
    tasks: [{
      id: 'two-step', fixture: 'clean-app', timeoutMs: 1000, budgetUsd: 1,
      steps: [
        { prompt: 'first', assert: [{ file_exists: 'marker-from-step-0.txt' }] },
        { prompt: 'second', assert: [{ workdir_unchanged: false }] },
      ],
    }],
    invoke, fixturesDir: FIXTURES, harnessBin: HARNESS,
  });
  assert.deepEqual(calls.map((c) => c.step), [0, 1], 'both steps ran, in order');
  assert.equal(calls[0].cwd, calls[1].cwd, 'both steps run against the same working copy, not a fresh stage');
  assert.equal(calls[1].markerPresent, true, 'step 1 sees what step 0 left behind');
  assert.equal(out.results[0].verdict, 'pass');
});

test('a step that fails its own assertion stops the campaign — the next prompt is never sent', async () => {
  const calls = [];
  const invoke = async ({ step }) => { calls.push(step); return { transcript: 'nothing useful', usage: { usd: 0.01 } }; };
  const out = await runSuite({
    tasks: [{
      id: 'gated', fixture: 'clean-app', timeoutMs: 1000, budgetUsd: 1,
      steps: [
        { prompt: 'first', assert: [{ transcript_matches: 'this will never match' }] },
        { prompt: 'second', assert: [{ workdir_unchanged: true }] },
      ],
    }],
    invoke, fixturesDir: FIXTURES, harnessBin: HARNESS,
  });
  assert.deepEqual(calls, [0], 'step 1 never ran because step 0 failed its own assertion first');
  assert.equal(out.results[0].verdict, 'fail');
});

// B9. A step that runs out of money stops the campaign, and the task is ungraded rather than
// blamed on the model — the same rule run.mjs already enforces for a single-prompt task.
test('a step that exhausts its USD ceiling stops the campaign, and the task is inconclusive, not fail', async () => {
  const calls = [];
  const invoke = async ({ step, budgetUsd }) => {
    calls.push(step);
    if (step === 1) return { transcript: '', usage: { usd: budgetUsd }, incomplete: { reason: 'budget_exhausted', detail: `Reached maximum budget ($${budgetUsd})`, turns: 3 } };
    return { transcript: 'did step 0', usage: { usd: 0.005 } };
  };
  const out = await runSuite({
    tasks: [{
      id: 'ran-dry', fixture: 'clean-app', timeoutMs: 1000, budgetUsd: 0.01,
      steps: [
        { prompt: 'first', assert: [{ workdir_unchanged: true }] },
        { prompt: 'second', assert: [{ workdir_unchanged: true }] },
      ],
    }],
    invoke, fixturesDir: FIXTURES, harnessBin: HARNESS,
  });
  assert.deepEqual(calls, [0, 1], 'step 0 completed; step 1 is the one that ran dry');
  assert.equal(out.results[0].verdict, 'inconclusive');
  assert.equal(out.results[0].passed, 0, 'inconclusive is not a pass');
  assert.equal(out.results[0].runs[0].incomplete.step, 1, 'the runner records which step exhausted the budget');
  assert.equal(out.summary.fail, 0, 'exhausting budget mid-campaign is not scored a model failure');
  assert.equal(out.summary.inconclusive, 1);
});

test('CHECKS registers unseen_requirements and it reads ctx.work', () => {
  assert.ok(KNOWN.includes('unseen_requirements'));
  const d = dir();
  try {
    writeFileSync(path.join(d.root, 'a.txt'), 'nothing interesting\n');
    const [r] = evaluate({ work: d.root }, [{ unseen_requirements: ['partial payments'] }]);
    assert.equal(r.pass, true);
  } finally { d.cleanup(); }
});

// evidence.md F27. campaign-legacy spent 900 seconds producing zero tokens, was killed by the
// timeout, and was recorded `fail` on two assertions its step never reached — accusing the agent
// of missing a function it was never given the chance to write. `evolving-scope`'s safeguard is
// explicit: a campaign that cannot reach a model is inconclusive, never a verdict it did not earn.
test('a step the timeout killed before any output is inconclusive, not fail', async () => {
  const out = await runSuite({
    tasks: [{
      id: 'stalled', fixture: 'clean-app', timeoutMs: 1, budgetUsd: 1, repeats: 1,
      steps: [
        { prompt: 'one', assert: [{ workdir_unchanged: true }] },
        { prompt: 'two', assert: [{ workdir_unchanged: true }] },
      ],
    }],
    // Step one answers normally; step two is killed with nothing to show for it.
    invoke: async ({ step }) => (step === 0
      ? { transcript: 'did the work', usage: { usd: 0.01, output_tokens: 40 } }
      : { transcript: '', usage: { usd: 0, output_tokens: 0 }, timedOut: true }),
    fixturesDir: FIXTURES, harnessBin: HARNESS,
  });
  assert.equal(out.results[0].verdict, 'inconclusive', 'a step that never ran is not a failure');
  assert.equal(out.results[0].runs[0].incomplete.reason, 'timed_out');
  assert.equal(out.results[0].runs[0].incomplete.step, 1, 'names the step that stalled');
  assert.equal(out.summary.fail, 0);
});

// The other half, and the reason the guard is narrow: a timeout that arrives after the model has
// worked is still graded. Partial work is work, and the transcript is there to read.
test('a step that timed out after producing output is still graded', async () => {
  const out = await runSuite({
    tasks: [{
      id: 'slow-but-real', fixture: 'clean-app', timeoutMs: 1, budgetUsd: 1, repeats: 1,
      steps: [{ prompt: 'one', assert: [{ transcript_matches: 'ledger' }] }],
    }],
    invoke: async () => ({ transcript: 'wrote the ledger', usage: { usd: 0.2, output_tokens: 90 }, timedOut: true }),
    fixturesDir: FIXTURES, harnessBin: HARNESS,
  });
  assert.equal(out.results[0].runs[0].incomplete, null);
  assert.equal(out.results[0].verdict, 'pass');
});

// a-diff-belongs-to-one-change B7. F26: sprint 3's plan was refused at the gate and the sprint
// wrote `isOverdue` anyway, because sprint 2's plan owned the file. The assertion reads the
// diff since the previous step and checks every product path against the plan of the change
// that is current when the step ends — not against every plan the working copy has collected.
test('diffOwnedByCurrentChange passes a file the current plan names and fails one it does not', () => {
  const d = dir();
  const before = mkdtempSync(path.join(tmpdir(), 'campaign-prev-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: d.root });
    spawnSync('git', ['config', 'user.email', 'eval@harness'], { cwd: d.root });
    spawnSync('git', ['config', 'user.name', 'eval'], { cwd: d.root });
    mkdirSync(path.join(d.root, 'src'), { recursive: true });
    writeFileSync(path.join(d.root, 'src/ledger.mjs'), 'export const a = 1;\n');
    cpSync(d.root, before, { recursive: true });

    // Sprint 2's change owns src/ledger.mjs; sprint 3's is newer, approved, and owns only src/rules.mjs.
    const seal = (body, at) => {
      const draft = render({ status: 'draft' }, body);
      return render({ status: 'approved', by: 'unattended-eval-run', at, digest: bodyDigest(draft) }, body);
    };
    for (const [slug, at, owns] of [['sprint-2', '2026-09-01T00:00:00.000Z', 'src/ledger.mjs'], ['sprint-3', '2026-09-02T00:00:00.000Z', 'src/rules.mjs']]) {
      const a = path.join(d.root, '.aidlc/artifacts', slug);
      mkdirSync(a, { recursive: true });
      writeFileSync(path.join(a, 'intent.md'), '---\nstatus: draft\n---\n# Intent\n');
      writeFileSync(path.join(a, 'spec.md'), seal(`# Spec: ${slug}\n\n### B1\n\nGiven, when, then.\n`, at));
      writeFileSync(path.join(a, 'plan.md'), seal(`# Plan: ${slug}\n\n## Files\n\n- \`${owns}\`\n`, at));
    }
    spawnSync('git', ['add', '-A'], { cwd: d.root });
    spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'artifacts'], { cwd: d.root });

    writeFileSync(path.join(d.root, 'src/rules.mjs'), 'export const b = 2;\n');
    writeFileSync(path.join(d.root,'CODEBASE-MAP.md'),'generated map output');
    const owned = diffOwnedByCurrentChange(d.root, before);
    assert.equal(owned.ok, true, owned.violations.join('; '));
    assert.equal(owned.current, 'sprint-3');

    // The F26 write: the file sprint 2's plan owns, edited under sprint 3.
    writeFileSync(path.join(d.root, 'src/ledger.mjs'), 'export const a = 1; export const isOverdue = () => false;\n');
    const routed = diffOwnedByCurrentChange(d.root, before);
    assert.equal(routed.ok, false);
    assert.match(routed.violations.join(';'), /src\/ledger\.mjs.*sprint-3/);

    // Artifacts and state never count as product files.
    writeFileSync(path.join(d.root, 'src/ledger.mjs'), 'export const a = 1;\n');
    writeFileSync(path.join(d.root, '.aidlc/artifacts/sprint-3/evidence.md'), '# notes\n');
    assert.equal(diffOwnedByCurrentChange(d.root, before).ok, true);
  } finally { d.cleanup(); rmSync(before, { recursive: true, force: true }); }
});
