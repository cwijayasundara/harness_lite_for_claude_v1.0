// G24, 2026-09-15. The completion plan's native comparison names "the driver from G09 in the
// harness arm", and the existing harness arm is the pause/approve/implement protocol — a human
// relaying prompts, which is exactly the shape `harness deliver` replaced. This arm runs the
// driver itself, once per sprint, against the same staged product the native arm gets.
//
// Fakes throughout: what is tested is the protocol around the driver — approvals before it runs,
// scope after it, spend charged to the comparison, the evaluator's catches counted — not a model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FIXTURES, stage, stageProduct } from '../evals/lib/stage.mjs';
import { runDriverCampaign } from '../evals/lib/driver-campaign.mjs';
import { comparisonPairs, summarizeComparisons, g24Verdict } from '../evals/lib/comparison.mjs';
import { parse } from '../.aidlc/lib/artifacts.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const models = { generator: 'gen', evaluator: 'eval', evals: 'cheap' };
const step = { slug: 'ledger-characterize', request: 'add balance', behaviours: ['B1 text'], files: ['src/ledger.mjs', 'tests/ledger.test.mjs'], level: 1 };
const task = { id: 'campaign-ledger', fixture: 'campaign-ledger', product: 'ledger', steps: [step], timeoutMs: 60000, budgetUsd: 3 };

function staged() {
  const s = stage(FIXTURES, 'campaign-ledger', { product: true });
  stageProduct(s, root);
  const evidence = mkdtempSync(path.join(tmpdir(), 'driver-campaign-'));
  return { s, evidence, cleanup: () => { s.cleanup(); rmSync(evidence, { recursive: true, force: true }); } };
}

// A driver that behaves: edits only the plan's files, writes the state the real one writes, and
// reports the numbers the real one reports.
function fakeDriver({ edits = ['src/ledger.mjs'], repaired = 1, usd = 0.8, ok = true, stopped = null } = {}) {
  const calls = [];
  return { calls, run: ({ work, slug, args }) => {
    calls.push({ work, slug, args });
    for (const rel of edits) { const f = path.join(work, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, `${existsSync(f) ? readFileSync(f, 'utf8') : ''}// delivered by fake driver\n`); }
    const dir = path.join(work, '.aidlc/state/deliver', slug); mkdirSync(dir, { recursive: true });
    const events = [{ phase: 'implement', event: 'model-turn-done', usd: 0.2, usage: { input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 0, output_tokens: 5 } },
      { phase: 'review', event: 'model-turn-done', usd: 0.5 }, ...Array.from({ length: repaired }, (_, i) => ({ phase: 'repair', event: 'repaired', attempt: i + 1 }))];
    writeFileSync(path.join(dir, 'phases.json'), JSON.stringify({ slug, completed: ok ? ['implement', 'check-stop', 'refactor', 'review', 'repair', 'check-commit', 'pr'] : ['implement'], repairs: repaired, usd, events, review: { verdict: 'approve' } }));
    mkdirSync(path.join(work, '.aidlc/artifacts', slug), { recursive: true });
    writeFileSync(path.join(work, '.aidlc/artifacts', slug, 'review.md'), '# Independent review\n\n## Important\n\nfake finding\n\napprove\n');
    const result = ok ? { slug, ok: true, usd, usd_per_accepted_change: usd, cache_read_share: 0.9, turns: 6, wall_ms: 90000, repairs: repaired, completed: ['implement', 'check-stop', 'refactor', 'review', 'repair', 'check-commit', 'pr'], pr: null, pr_unopened: 'no git remotes found' }
      : { slug, ok: false, usd, stopped, completed: ['implement'] };
    return { status: ok ? 0 : 1, stdout: JSON.stringify(result), stderr: '' };
  } };
}

test('the driver arm approves before the driver runs, runs it once per sprint in the staged product, and accepts what the grader accepts', async () => {
  const t = staged(); const driver = fakeDriver(); const charged = [];
  try {
    const out = await runDriverCampaign({ task, config: { id: 'harness-driver', driver: true, model: 'gen' }, productTree: t.s, evidenceDir: t.evidence,
      evaluateProduct: () => ({ name: 'ledger-level-1', pass: true }), invoke: async () => { throw new Error('the driver arm does not call the plain invoker for delivery'); },
      runDeliver: driver.run, charge: (usd, allowance) => charged.push([usd, allowance]) });
    assert.equal(driver.calls.length, 1);
    assert.equal(driver.calls[0].slug, 'ledger-characterize');
    assert.ok(driver.calls[0].args.includes('--live'));
    assert.equal(driver.calls[0].work, t.s.work);
    // The approvals were on disk and committed before the driver started: the driver never grants one.
    const log = execFileSync('git', ['log', '--format=%s'], { cwd: t.s.work, encoding: 'utf8' });
    assert.match(log, /Simulated approval: ledger-characterize\/plan/);
    for (const kind of ['spec', 'plan']) assert.equal(parse(readFileSync(path.join(t.s.work, '.aidlc/artifacts/ledger-characterize', `${kind}.md`), 'utf8')).front.status, 'approved');
    assert.equal(out.completedSteps, 1);
    assert.equal(out.pass, true, JSON.stringify(out.assertions));
    assert.equal(out.usage.usd, 0.8);
    assert.equal(out.billingComplete, true);
    assert.deepEqual(charged, [[0.8, 3]], 'the comparison budget is charged what the driver reported');
    assert.equal(out.evaluatorCaughtDefects, 1, 'one review requested changes and its repair was accepted');
    assert.equal(out.driverStops, 0);
    assert.ok(out.phases.some((p) => p.name === 'model-deliver' && p.usage.usd === 0.8), 'the driver run is a model phase, so calibration can count it');
    // The evidence keeps the driver's own record beside the product.
    assert.ok(existsSync(path.join(t.evidence, 'deliver', 'ledger-characterize', 'phases.json')));
    assert.ok(existsSync(path.join(t.evidence, 'deliver', 'ledger-characterize', 'review.md')));
    // [deliver] bounds were pinned in the staged product before the run.
    assert.match(readFileSync(path.join(t.s.work, '.aidlc/harness.toml'), 'utf8'), /\[deliver\]\nmax_usd\s*=\s*3/);
  } finally { t.cleanup(); }
});

test('a driver that edits outside the plan is a scope failure the arm records, and a stopped driver is not an accepted change', async () => {
  const t = staged();
  try {
    const out = await runDriverCampaign({ task, config: { id: 'harness-driver', driver: true }, productTree: t.s, evidenceDir: t.evidence,
      evaluateProduct: () => ({ name: 'x', pass: true }), invoke: async () => ({ usage: { usd: 0.01 }, sessionId: 's', exitCode: 0, transcript: 'repaired' }),
      runDeliver: fakeDriver({ edits: ['src/ledger.mjs', 'src/fees.mjs'] }).run, charge: () => {} });
    assert.equal(out.completedSteps, 0);
    assert.ok(out.assertions.some((a) => !a.pass && /out-of-scope/.test(a.detail)), JSON.stringify(out.assertions));
  } finally { t.cleanup(); }
  const u = staged();
  try {
    const out = await runDriverCampaign({ task, config: { id: 'harness-driver', driver: true }, productTree: u.s, evidenceDir: u.evidence,
      evaluateProduct: () => ({ name: 'x', pass: true }), invoke: async () => { throw new Error('no repair for a stopped run'); },
      runDeliver: fakeDriver({ ok: false, stopped: { bound: 'max_repairs', detail: '2 repair turns did not clear the review' }, usd: 2.5 }).run, charge: () => {} });
    assert.equal(out.completedSteps, 0);
    assert.equal(out.driverStops, 1);
    assert.equal(out.usage.usd, 2.5, 'a stopped run still cost what it cost');
    assert.ok(out.assertions.some((a) => !a.pass && /max_repairs/.test(a.detail)));
  } finally { u.cleanup(); }
});

test('a shipped defect — grader failure after the driver delivered — is counted and repaired the way the native arm is', async () => {
  const t = staged(); let graded = 0; const repairs = [];
  try {
    const out = await runDriverCampaign({ task, config: { id: 'harness-driver', driver: true }, productTree: t.s, evidenceDir: t.evidence,
      evaluateProduct: () => { graded++; if (graded === 1) throw new Error('outstandingBalance wrong'); return { name: 'x', pass: true }; },
      invoke: async ({ prompt }) => { repairs.push(prompt); return { usage: { usd: 0.1 }, sessionId: 's', exitCode: 0, transcript: 'repaired' }; },
      runDeliver: fakeDriver({ repaired: 0 }).run, charge: () => {} });
    assert.equal(out.completedSteps, 1);
    assert.equal(out.shippedDefects, 1, 'the evaluator approved something the grader refused');
    assert.equal(out.verificationFailures, 1);
    assert.equal(out.retries, 1);
    assert.equal(repairs.length, 1);
    assert.match(repairs[0], /outstandingBalance wrong/);
    assert.equal(out.evaluatorCaughtDefects, 0);
  } finally { t.cleanup(); }
});

test('the driver pair is reachable only by name, and its summary carries the three G24 numbers', () => {
  assert.ok(!comparisonPairs(models).some((p) => p.id === 'driver'), 'a default --compare run still runs exactly the pairs it ran before');
  const [pair] = comparisonPairs(models, { pair: 'driver' });
  assert.deepEqual(pair.arms.map((a) => a.id), ['native', 'harness-driver']);
  assert.equal(pair.arms[0].native, true);
  assert.equal(pair.arms[1].driver, true);
  const rows = [
    { pair: 'driver', config: { id: 'native' }, kind: 'paired', status: 'pass', result: { pass: true, completedSteps: 5, billingComplete: true, usage: { reportedUsd: 1 }, shippedDefects: 2, latencyMs: 10 } },
    { pair: 'driver', config: { id: 'harness-driver' }, kind: 'paired', status: 'pass', result: { pass: true, completedSteps: 5, billingComplete: true, usage: { reportedUsd: 1.05 }, evaluatorCaughtDefects: 3, driverStops: 0, latencyMs: 20 } },
  ];
  const summary = summarizeComparisons(rows);
  assert.equal(summary['driver/native/paired'].shippedDefects, 2);
  assert.equal(summary['driver/harness-driver/paired'].evaluatorCaughtDefects, 3);
  const verdict = g24Verdict(summary, { repetitions: 1 });
  assert.equal(verdict.acceptance.pass, true);
  assert.equal(verdict.cost.pass, true, JSON.stringify(verdict.cost));
  assert.equal(verdict.cost.ceiling, 0.2 * 1.1);
  assert.equal(verdict.defects.pass, true);
  assert.equal(verdict.pass, true);
  // 29% dearer at identical acceptance is the number on the board today, and it fails.
  const dearer = summarizeComparisons([rows[0], { ...rows[1], result: { ...rows[1].result, usage: { reportedUsd: 1.29 } } }]);
  const failed = g24Verdict(dearer, { repetitions: 1 });
  assert.equal(failed.cost.pass, false);
  assert.equal(failed.pass, false);
  // No evaluator catch in a campaign is a "no", not an "unmeasured".
  const quiet = summarizeComparisons([rows[0], { ...rows[1], result: { ...rows[1].result, evaluatorCaughtDefects: 0 } }]);
  assert.equal(g24Verdict(quiet, { repetitions: 1 }).defects.pass, false);
  // Unknown billing cannot pass the cost criterion.
  const unknown = summarizeComparisons([rows[0], { ...rows[1], result: { ...rows[1].result, billingComplete: false } }]);
  assert.equal(g24Verdict(unknown, { repetitions: 1 }).cost.pass, false);
});

test('repeats 0 is the pilot: calibration only, and the verdict reads the smoke groups and says it is a pilot', async () => {
  const { runComparisons } = await import('../evals/lib/comparison.mjs');
  const evidenceRoot = mkdtempSync(path.join(tmpdir(), 'comparison-pilot-'));
  try {
    const out = await runComparisons({ tasks: [{ id: 'ledger', fixture: 'campaign-ledger', steps: [{}, {}] }], models, root, fixturesDir: FIXTURES, evidenceRoot, pair: 'driver', repetitions: 0, maxUsd: 1,
      invokeFactory: () => async () => ({ usage: { usd: 0.001 } }),
      runCampaign: async ({ task, invoke }) => { await invoke({ budgetUsd: 0.1 }); return { pass: true, completedSteps: task.steps.length, billingComplete: true, usage: { usd: 0.001, reportedUsd: 0.001 }, phases: [{ name: 'model-plan' }], shippedDefects: 1 }; } });
    assert.equal(out.attempts.length, 2, 'one smoke attempt per arm and nothing paired');
    assert.ok(out.attempts.every((a) => a.kind === 'smoke' && a.status === 'pass'));
    assert.ok(out.attempts.every((a) => a.result.completedSteps === 1), 'a smoke attempt is the first sprint only');
    const verdict = g24Verdict(out.summary, { repetitions: 0 });
    assert.equal(verdict.pilot, true); assert.equal(verdict.kind, 'smoke');
    assert.equal(verdict.acceptance.native, 1);
  } finally { rmSync(evidenceRoot, { recursive: true, force: true }); }
});
