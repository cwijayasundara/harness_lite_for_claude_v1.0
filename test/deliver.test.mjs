// G09. `harness deliver <slug>` — the seven phases between the plan approval and the merge
// decision, driven by the harness instead of by a human relaying command output.
//
// Every test here uses a fake invoker, a fake check and a fake review: the driver's sequencing,
// its bounds, its resumption and the two things it must never do are all properties of the phase
// machine, and none of them needs a model to observe. The two negative properties — it grants no
// approval it did not receive, and it never declares its own change merge-ready — are asserted
// over a complete run, because neither is enforced by a guard: the driver runs no hook, and the
// artifact directory is always writable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig, DEFAULT_DELIVER } from '../.aidlc/lib/config.mjs';
import * as a from '../.aidlc/lib/artifacts.mjs';
import { deliver, readState, statePath, bounds, reviewVerdict, PHASES } from '../.aidlc/lib/deliver.mjs';
import { read as readLedger } from '../.aidlc/lib/ledger.mjs';
import { FIXTURES, stage } from '../evals/lib/stage.mjs';
import { A } from './_paths.mjs';

const SLUG = 'hyphen-titlecase';
const OWNED = 'src/app/text.py';
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

// One approved change, its two gates recorded, and a working tree the fake turns can edit.
function delivery(overrides = {}) {
  const s = stage(FIXTURES, 'contract-planned');
  const cfg = { ...loadConfig(s.work), ...overrides };
  const calls = { turns: [], checks: [], reviews: [], prs: [] };
  const edit = (marker) => writeFileSync(path.join(s.work, OWNED), `${readFileSync(path.join(s.work, OWNED), 'utf8')}# ${marker}\n`);
  const fakes = {
    live: true,
    async invoke({ phase, prompt, model, effort }) {
      calls.turns.push({ phase, model, effort, prompt });
      edit(`${phase}-${calls.turns.length}`);
      return { ok: true, usd: 0.01, sessionId: 'session-1', transcript: `${phase} done` };
    },
    async check(stageName) { calls.checks.push(stageName); return { stage: stageName, ok: true, controls: [] }; },
    async review(options) {
      calls.reviews.push(options);
      writeFileSync(path.resolve(s.work, options.output),
        '# Independent review\n\nStatus: complete\n\n## Findings\n\nNone.\n\n## Verdict\n\napprove\n');
      return { status: 'complete', output: options.output, usd: 0.02, export: { scope: 'plan', files: 4 } };
    },
    async openPr(pr) { calls.prs.push(pr); return { url: 'https://github.com/team/product/pull/7' }; },
  };
  return { s, cfg, calls, fakes, edit,
    approvals: () => a.GATED.map((kind) => a.read(cfg, SLUG, kind)?.front.approval_digest ?? null) };
}

test('the driver runs the seven phases, records each before and after, and opens a PR it neither approves nor merges', async () => {
  const d = delivery();
  try {
    const before = d.approvals();
    const result = await deliver(d.cfg, SLUG, d.fakes);

    assert.equal(result.ok, true, JSON.stringify(result.stopped));
    assert.deepEqual(result.completed, PHASES, 'every phase ran, in order');
    assert.equal(result.pr, 'https://github.com/team/product/pull/7');

    // implement, refactor. No repair turn: the checks were green and the review approved.
    assert.deepEqual(d.calls.turns.map((t) => t.phase), ['implement', 'refactor']);
    // stop after implement, stop after refactor, commit at the end.
    assert.deepEqual(d.calls.checks, ['stop', 'stop', 'commit']);
    assert.equal(d.calls.reviews.length, 1);
    assert.deepEqual(d.calls.reviews[0].planFiles, ['src/app/text.py', 'tests/test_app.py'],
      'the review is scoped to the plan the driver is executing');
    assert.notEqual(d.calls.reviews[0].base, d.calls.reviews[0].candidate, 'the driver committed what it wrote');

    // Every model turn says so: no human is waiting to answer a question in it.
    for (const turn of d.calls.turns) assert.match(turn.prompt, /No human is available to answer a question/);

    // Recorded before each phase starts and after it ends — a killed run is resumable, not merely
    // diagnosable.
    const state = readState(d.cfg, SLUG);
    for (const phase of PHASES) {
      assert.ok(state.events.some((e) => e.phase === phase && e.event === 'start'), `${phase} start not recorded`);
      assert.ok(state.events.some((e) => e.phase === phase && e.event === 'end'), `${phase} end not recorded`);
    }
    const order = state.events.filter((e) => e.event === 'start').map((e) => e.phase);
    assert.deepEqual(order, PHASES);
    assert.ok(readLedger(d.cfg.layout).some((row) => row.kind === 'deliver-phase' && row.change === SLUG));

    // B6: no approval was granted by the run. B7: the review artifact is not `approved`, so the
    // change's next step is still `implement` and not `merge`.
    assert.deepEqual(d.approvals(), before, 'the driver moved an approval');
    assert.notEqual(a.read(d.cfg, SLUG, 'review')?.front.status, 'approved');

    const body = d.calls.prs[0].body;
    assert.match(body, new RegExp(`Harness-Change: ${SLUG}`));
    assert.match(body, /\| spec \| approved \|/);
    assert.match(body, /\| plan \| approved \|/);
    assert.match(body, /Verdict: \*\*approve\*\*/);
    assert.match(body, new RegExp(`Ledger invocation: \`${result.invocation}\``));
    assert.match(body, /scoped to 4 files/);
    assert.match(body, /approved nothing and merged nothing/);
  } finally { d.s.cleanup(); }
});

test('an interrupted run resumes from the phase that had not completed and pays for nothing it already did', async () => {
  const d = delivery();
  try {
    // The kill: the review phase never returns. Everything before it completed and is recorded.
    await assert.rejects(() => deliver(d.cfg, SLUG, { ...d.fakes, review: async () => { throw new Error('simulated kill'); } }),
      /simulated kill/);
    const killed = readState(d.cfg, SLUG);
    assert.deepEqual(killed.completed, ['implement', 'check-stop', 'refactor']);
    assert.equal(d.calls.turns.length, 2);

    const result = await deliver(d.cfg, SLUG, d.fakes);
    assert.equal(result.ok, true, JSON.stringify(result.stopped));
    assert.deepEqual(result.completed, PHASES);
    // The generator was not paid a second time for work already on disk.
    assert.deepEqual(d.calls.turns.map((t) => t.phase), ['implement', 'refactor'],
      'a completed phase was executed again on resume');
    assert.deepEqual(d.calls.checks, ['stop', 'stop', 'commit'], 'a completed check ran again on resume');
  } finally { d.s.cleanup(); }
});

test('a run refuses to resume when the plan it was executing has been approved again', async () => {
  const d = delivery();
  try {
    await assert.rejects(() => deliver(d.cfg, SLUG, { ...d.fakes, review: async () => { throw new Error('simulated kill'); } }));

    // A human edited and re-approved the plan while the run was stopped. The authority the run
    // was executing under is gone.
    const plan = a.read(d.cfg, SLUG, 'plan');
    writeFileSync(plan.file, a.render(plan.front, `${plan.body}\n## Order\n\n4. One more step nobody in the stopped run agreed to.\n`));
    git(d.s.work, 'add', '-A');
    git(d.s.work, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'plan: one more step');
    // The fixture's approvals predate the binding format, so the spec is re-approved first —
    // which is what a human editing an approved plan has to do anyway.
    a.approve(d.cfg, SLUG, 'spec', { by: 'the human' });
    git(d.s.work, 'add', '-A');
    git(d.s.work, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'spec: re-approved');
    a.approve(d.cfg, SLUG, 'plan', { by: 'the human' });

    await assert.rejects(() => deliver(d.cfg, SLUG, d.fakes), /approved plan changed since the interrupted run/);
    // Refusing is not deleting: the stopped run's evidence is still on disk for the human.
    assert.ok(existsSync(statePath(d.cfg, SLUG)));
  } finally { d.s.cleanup(); }
});

test('each bound stops the run, names itself, and leaves resumable state behind', async () => {
  for (const [config, bound, expectation] of [
    [{ max_usd: 0.005 }, 'max_usd', (r) => assert.ok(r.usd >= 0.005)],
    [{ max_minutes: 1 }, 'max_minutes', () => {}],
  ]) {
    const d = delivery({ deliver: config });
    try {
      // A clock the test owns: max_minutes is a wall-clock bound and must not need one to pass.
      let clock = Date.now();
      const now = () => (bound === 'max_minutes' ? (clock += 45000) : clock);
      const result = await deliver(d.cfg, SLUG, { ...d.fakes, now });
      assert.equal(result.ok, false);
      assert.equal(result.stopped.bound, bound, JSON.stringify(result.stopped));
      assert.ok(result.stopped.detail, 'a stopped run says where it stopped');
      expectation(result);
      assert.ok(readState(d.cfg, SLUG).completed.length < PHASES.length, 'a bound is not a completed run');
      assert.ok(readState(d.cfg, SLUG).stopped.bound === bound);
    } finally { d.s.cleanup(); }
  }
});

test('a review that keeps requesting changes stops at max_repairs, and the second attempt escalates', async () => {
  const d = delivery({ deliver: { max_repairs: 2 } });
  try {
    const review = async (options) => {
      d.calls.reviews.push(options);
      writeFileSync(path.resolve(d.s.work, options.output),
        '# Independent review\n\n### Blocking — the hyphen is still dropped\n\n`src/app/text.py:5`\n\n## Verdict\n\nchanges-requested\n');
      return { status: 'complete', output: options.output, usd: 0.01, export: { scope: 'plan', files: 4 } };
    };
    const result = await deliver(d.cfg, SLUG, { ...d.fakes, review });

    assert.equal(result.stopped.bound, 'max_repairs');
    assert.equal(readState(d.cfg, SLUG).repairs, 2);
    const repairs = d.calls.turns.filter((t) => t.phase.startsWith('repair'));
    assert.deepEqual(repairs.map((t) => t.phase), ['repair', 'repair-escalated']);
    assert.equal(repairs[0].model, d.cfg.models.generator);
    assert.equal(repairs[0].effort, d.cfg.effort.repair);
    assert.equal(repairs[1].model, d.cfg.models.judgment, 'the second repair escalates past the model that failed once');
    assert.notEqual(repairs[1].model, d.cfg.models.generator);
    // G10: the ledger row for a phase names what it ran on.
    const rows = readLedger(d.cfg.layout).filter((r) => r.kind === 'deliver-phase' && r.event === 'model-turn');
    assert.ok(rows.some((r) => r.stage === 'repair-escalated' && r.model === d.cfg.models.judgment && r.effort === d.cfg.effort.repair));
    assert.ok(rows.some((r) => r.stage === 'implement' && r.model === d.cfg.models.generator && r.effort === d.cfg.effort.implement));
    assert.ok(rows.some((r) => r.stage === 'review' && r.model === d.cfg.models.evaluator && r.effort === d.cfg.effort.review));
    assert.match(repairs[0].prompt, /Blocking/, 'the repair turn is given the findings to address');
    // Three reviews: the first, and one confirming each repair.
    assert.equal(d.calls.reviews.length, 3);
    // The run stopped; it did not open a pull request on a change the reviewer rejected.
    assert.equal(d.calls.prs.length, 0);
    assert.deepEqual(d.approvals(), d.approvals(), 'no approval moved');
    assert.notEqual(a.read(d.cfg, SLUG, 'review')?.front.status, 'approved');
  } finally { d.s.cleanup(); }
});

test('the driver refuses to spend without --live, previews with --dry, and reads its bounds from [deliver]', async () => {
  const d = delivery({ deliver: { max_minutes: 5, max_usd: 3, max_repairs: 1 } });
  try {
    assert.deepEqual(bounds(d.cfg), { max_minutes: 5, max_usd: 3, max_repairs: 1 });
    assert.deepEqual(bounds({ deliver: {} }), DEFAULT_DELIVER);
    assert.throws(() => bounds({ deliver: { max_usd: 0 } }), /positive/);
    assert.throws(() => bounds({ deliver: { max_minutes: 'soon' } }), /positive/);

    await assert.rejects(() => deliver(d.cfg, SLUG, { ...d.fakes, live: false }), /--live/);
    assert.equal(d.calls.turns.length, 0, 'a preview that costs money is not a preview');

    const preview = await deliver(d.cfg, SLUG, { ...d.fakes, live: false, dry: true });
    assert.deepEqual(preview.phases, PHASES);
    assert.deepEqual(preview.stages.implement, { model: d.cfg.models.generator, effort: 'low' });
    assert.deepEqual(preview.stages['repair-escalated'], { model: d.cfg.models.judgment, effort: 'medium' });
    assert.deepEqual(preview.stages.review, { model: d.cfg.models.evaluator, effort: 'high' });
    assert.deepEqual(preview.bounds, { max_minutes: 5, max_usd: 3, max_repairs: 1 });
    assert.deepEqual(preview.owns, ['src/app/text.py', 'tests/test_app.py']);
    assert.equal(d.calls.turns.length, 0);
    assert.equal(existsSync(statePath(d.cfg, SLUG)), false, 'a preview starts no run');
  } finally { d.s.cleanup(); }
});

test('the driver contains no path to an approval or a merge', () => {
  const source = readFileSync(path.join(A, 'lib', 'deliver.mjs'), 'utf8');
  // The one approval it may record is the one `[gates] = "auto"` already gave, and `approve()`
  // refuses that call in every other mode.
  const approvals = [...source.matchAll(/artifacts\.approve\([^)]*\)/g)].map((m) => m[0]);
  assert.equal(approvals.length, 1, 'a second approval path appeared in the driver');
  assert.match(approvals[0], /policy: true/);
  assert.doesNotMatch(source, /pr\s+merge|--merge|--auto-merge|--admin/, 'the driver can merge');
  assert.doesNotMatch(source, /status:\s*'approved'|status:\s*"approved"/, 'the driver writes an approval status');
});

test('a review verdict is read conservatively: an ambiguous report is not an approval', () => {
  assert.equal(reviewVerdict('## Verdict\n\napprove\n').verdict, 'approve');
  assert.equal(reviewVerdict('## Verdict\n\nchanges-requested\n').verdict, 'changes-requested');
  assert.equal(reviewVerdict('Nothing to report, but changes-requested on the proof row.').verdict, 'changes-requested');
  const findings = reviewVerdict('### Blocking — a\n### Important — b\n### Nit — c\nchanges-requested').findings;
  assert.equal(findings.length, 2, 'a nit is not worth a model turn');
});
