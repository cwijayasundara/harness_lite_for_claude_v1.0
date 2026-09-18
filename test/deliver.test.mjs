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
import { loadConfig, DEFAULT_DELIVER } from '../.claude/harness/lib/config.mjs';
import * as a from '../.claude/harness/lib/artifacts.mjs';
import { deliver, deliverInvoker, readState, statePath, bounds, reviewVerdict, PHASES } from '../.claude/harness/lib/deliver.mjs';
import { read as readLedger } from '../.claude/harness/lib/ledger.mjs';
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

test('the driver runs the six phases, records each before and after, and opens a PR it neither approves nor merges', async () => {
  const d = delivery();
  try {
    const before = d.approvals();
    const result = await deliver(d.cfg, SLUG, d.fakes);

    assert.equal(result.ok, true, JSON.stringify(result.stopped));
    assert.deepEqual(result.completed, PHASES, 'every phase ran, in order');
    assert.equal(result.pr, 'https://github.com/team/product/pull/7');

    // implement only. No repair turn: the checks were green and the review approved. No refactor
    // turn: cut 2026-09-15 after the first live run (see PHASES).
    assert.deepEqual(d.calls.turns.map((t) => t.phase), ['implement']);
    // stop after implement, commit at the end.
    assert.deepEqual(d.calls.checks, ['stop', 'commit']);
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
    assert.deepEqual(killed.completed, ['implement', 'check-stop']);
    assert.equal(d.calls.turns.length, 1);

    const result = await deliver(d.cfg, SLUG, d.fakes);
    assert.equal(result.ok, true, JSON.stringify(result.stopped));
    assert.deepEqual(result.completed, PHASES);
    // The generator was not paid a second time for work already on disk.
    assert.deepEqual(d.calls.turns.map((t) => t.phase), ['implement'],
      'a completed phase was executed again on resume');
    assert.deepEqual(d.calls.checks, ['stop', 'commit'], 'a completed check ran again on resume');
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

// Cut 2026-09-15 after the first live run: two evaluator reviews were 66% of the run's cost, and
// the plan's own criterion (native plus 10%) was missed 6.3x. One review, one repair turn on its
// Blocking/Important findings, no confirming review — the second look is the pull request's.
test('a changes-requested review buys one repair turn and no second review, and the PR says so', async () => {
  const d = delivery();
  try {
    const review = async (options) => {
      d.calls.reviews.push(options);
      writeFileSync(path.resolve(d.s.work, options.output),
        '# Independent review\n\n### Blocking — the hyphen is still dropped\n\n`src/app/text.py:5`\n\n## Verdict\n\nchanges-requested\n');
      return { status: 'complete', output: options.output, usd: 0.01, export: { scope: 'plan', files: 4 } };
    };
    const result = await deliver(d.cfg, SLUG, { ...d.fakes, review });

    assert.equal(result.ok, true, JSON.stringify(result.stopped));
    assert.equal(result.repairs, 1);
    const repairs = d.calls.turns.filter((t) => t.phase.startsWith('repair'));
    assert.deepEqual(repairs.map((t) => t.phase), ['repair']);
    assert.equal(repairs[0].model, d.cfg.models.generator);
    assert.equal(repairs[0].effort, d.cfg.effort.repair);
    assert.match(repairs[0].prompt, /Blocking/, 'the repair turn is given the findings to address');
    // G10: the ledger row for a phase names what it ran on.
    const rows = readLedger(d.cfg.layout).filter((r) => r.kind === 'deliver-phase' && r.event === 'model-turn');
    assert.ok(rows.some((r) => r.stage === 'repair' && r.model === d.cfg.models.generator && r.effort === d.cfg.effort.repair));
    assert.ok(rows.some((r) => r.stage === 'implement' && r.model === d.cfg.models.generator && r.effort === d.cfg.effort.implement));
    assert.ok(rows.some((r) => r.stage === 'review' && r.model === d.cfg.models.evaluator && r.effort === d.cfg.effort.review));
    // One review. The repair is checked deterministically, not re-reviewed.
    assert.equal(d.calls.reviews.length, 1);
    assert.deepEqual(d.calls.checks, ['stop', 'stop', 'commit']);
    assert.equal(result.review.verdict, 'changes-requested');
    assert.equal(result.review.repaired, true);
    // The PR carries the verdict and the fact that nobody but its reader has looked since.
    assert.equal(d.calls.prs.length, 1);
    assert.match(d.calls.prs[0].body, /Verdict: \*\*changes-requested\*\*/);
    assert.match(d.calls.prs[0].body, /one repair turn/);
    assert.match(d.calls.prs[0].body, /not re-reviewed/);
    assert.notEqual(a.read(d.cfg, SLUG, 'review')?.front.status, 'approved');
  } finally { d.s.cleanup(); }
});

test('the driver refuses to spend without --live, previews with --dry, and reads its bounds from [deliver]', async () => {
  const d = delivery({ deliver: { max_minutes: 5, max_usd: 3 } });
  try {
    assert.deepEqual(bounds(d.cfg), { max_minutes: 5, max_usd: 3 });
    assert.deepEqual(bounds({ deliver: {} }), DEFAULT_DELIVER);
    assert.throws(() => bounds({ deliver: { max_usd: 0 } }), /positive/);
    assert.throws(() => bounds({ deliver: { max_minutes: 'soon' } }), /positive/);

    await assert.rejects(() => deliver(d.cfg, SLUG, { ...d.fakes, live: false }), /--live/);
    assert.equal(d.calls.turns.length, 0, 'a preview that costs money is not a preview');

    const preview = await deliver(d.cfg, SLUG, { ...d.fakes, live: false, dry: true });
    assert.deepEqual(preview.phases, PHASES);
    assert.deepEqual(preview.stages.implement, { model: d.cfg.models.generator, effort: 'low' });
    assert.deepEqual(preview.stages.repair, { model: d.cfg.models.generator, effort: 'medium' });
    assert.equal(preview.stages['repair-escalated'], undefined, 'cut 2026-09-15');
    assert.equal(preview.stages.refactor, undefined, 'cut 2026-09-15');
    assert.deepEqual(preview.stages.review, { model: d.cfg.models.evaluator, effort: 'high' });
    assert.deepEqual(preview.bounds, { max_minutes: 5, max_usd: 3 });
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

// M1 step 1, 2026-09-15. The first attempt to run the driver for real found three things a fake
// invoker could not: the model turns loaded no plugin, so `implement` was a skill that did not
// exist; a fixture with no GitHub remote threw in the seventh phase and lost the run's result after
// every dollar was spent; and the run recorded a USD total and nothing else, so cost per accepted
// change, cache-read share and wall-clock — the three numbers the exit criterion asks for — had
// nowhere to come from.

test('the real invoker loads the plugin the CLI is running from, and hands the shim the same root', () => {
  const seen = [];
  const invoke = deliverInvoker({ root: '/tmp/product', pluginDir: '/opt/lean-harness',
    run: (args, options) => { seen.push({ args, options }); return { status: 0, stdout: JSON.stringify({ result: 'ok', total_cost_usd: 0.1, session_id: 's1', usage: { input_tokens: 5, cache_read_input_tokens: 95, cache_creation_input_tokens: 0, output_tokens: 7 }, duration_ms: 1234, num_turns: 3 }) }; } });
  const out = invoke({ prompt: 'p', model: 'm', budgetUsd: 1, timeoutMs: 1000 });
  const { args, options } = seen[0];
  assert.equal(args[args.indexOf('--plugin-dir') + 1], '/opt/lean-harness', 'the skills and hooks come from the plugin, not from whatever ~ has installed');
  assert.equal(args[args.indexOf('--tools') + 1], 'Read,Grep,Glob,Write,Edit', 'no shell: the post-write hook runs the checks (cut 2026-09-15)');
  assert.equal(options.env.HARNESS_HOME, '/opt/lean-harness', 'the consumer shim resolves the same runtime the driver is');
  assert.equal(options.env.AIDLC_UNATTENDED, '1');
  assert.equal(out.ok, true);
  assert.equal(out.usd, 0.1);
  assert.deepEqual(out.usage, { input_tokens: 5, cache_read_input_tokens: 95, cache_creation_input_tokens: 0, output_tokens: 7 });
  assert.equal(out.durationMs, 1234);
  assert.equal(out.turns, 3);
});

test('a pull request that cannot be opened is recorded, not thrown, and the body survives in the change\'s artifacts', async () => {
  const d = delivery();
  try {
    const result = await deliver(d.cfg, SLUG, { ...d.fakes, openPr: async () => { throw new Error('no git remotes found'); } });
    assert.equal(result.ok, true, 'the seven phases ran; opening the PR is the one side effect the fixture cannot host');
    assert.equal(result.pr, null);
    assert.match(result.pr_unopened, /no git remotes found/);
    assert.deepEqual(result.completed, PHASES);
    const body = readFileSync(path.join(d.s.work, '.claude/harness/artifacts', SLUG, 'pr.md'), 'utf8');
    assert.match(body, new RegExp(`Harness-Change: ${SLUG}`));
    const state = readState(d.cfg, SLUG);
    assert.ok(state.events.some((e) => e.phase === 'pr' && e.event === 'unopened'));
  } finally { d.s.cleanup(); }
});

test('a completed run records cost, cache-read share, turns and wall-clock in the ledger and in review.md', async () => {
  const d = delivery();
  try {
    let tick = 0;
    const fakes = { ...d.fakes,
      now: () => 1_700_000_000_000 + (tick += 30_000),
      async invoke(args) {
        const out = await d.fakes.invoke(args);
        return { ...out, usd: 0.25, usage: { input_tokens: 100, cache_creation_input_tokens: 100, cache_read_input_tokens: 800, output_tokens: 50 }, durationMs: 20_000, turns: 4 };
      },
      async review(options) {
        const out = await d.fakes.review(options);
        return { ...out, usd: 1, usage: { input_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 500, output_tokens: 100 }, durationMs: 60_000 };
      } };
    const result = await deliver(d.cfg, SLUG, fakes);
    assert.equal(result.ok, true, JSON.stringify(result.stopped));
    // one generator turn at 0.25 and one review at 1.
    assert.equal(result.usd, 1.25);
    assert.equal(result.usd_per_accepted_change, 1.25, 'one change delivered, so the run is the cost per change');
    const usage = result.usage;
    assert.equal(usage.cache_read_input_tokens, 1300);
    // cache read / (input + cache creation + cache read): 1300 / (600 + 100 + 1300) = 0.65
    assert.equal(result.cache_read_share, 0.65);
    assert.equal(result.turns, 4);
    assert.ok(result.wall_ms > 0);

    const row = readLedger(d.cfg.layout).find((r) => r.kind === 'deliver-run' && r.change === SLUG);
    assert.ok(row, 'the run wrote its summary row');
    assert.equal(row.usd, 1.25);
    assert.equal(row.cache_read_share, 0.65);
    assert.equal(row.usd_per_accepted_change, 1.25);
    assert.ok(readLedger(d.cfg.layout).some((r) => r.kind === 'deliver-phase' && r.event === 'model-turn-done' && r.usd === 0.25 && r.usage?.cache_read_input_tokens === 800));

    const review = readFileSync(path.join(d.s.work, '.claude/harness/artifacts', SLUG, 'review.md'), 'utf8');
    assert.match(review, /## Delivery run/);
    assert.match(review, /USD 1\.2500/);
    assert.match(review, /cache-read share 65%/);
    assert.match(review, /repairs 0/);
    // Never the key that advances a change to merge.
    assert.notEqual(a.read(d.cfg, SLUG, 'review')?.front.status, 'approved');
  } finally { d.s.cleanup(); }
});

test('an identity error from the checks stops the run by name and buys no repair turn', async () => {
  const d = delivery();
  try {
    const result = await deliver(d.cfg, SLUG, { ...d.fakes,
      async check(stageName) { d.calls.checks.push(stageName); return { stage: stageName, ok: false, controls: [], identity_errors: ['runtime mismatch: Use the recorded clean runtime commit'] }; } });
    assert.equal(result.ok, false);
    assert.equal(result.stopped.bound, 'check-stop');
    assert.match(result.stopped.detail, /runtime mismatch/);
    assert.deepEqual(d.calls.turns.map((t) => t.phase), ['implement'], 'no repair turn was paid for');
  } finally { d.s.cleanup(); }
});

// MEASURED 2026-09-15 (shift-swap sprint 1): the review timed out, wrote a partial report, and the
// driver read a verdict out of the partial text and paid USD 0.27 for a repair turn on it. A review
// that did not finish has no verdict; the run stops and says so, and the human decides.
test('an incomplete review is not a verdict: the run stops by name and buys no repair turn', async () => {
  const d = delivery();
  try {
    const result = await deliver(d.cfg, SLUG, { ...d.fakes,
      async review(options) {
        d.calls.reviews.push(options);
        writeFileSync(path.resolve(d.s.work, options.output), '# Independent review\n\nStatus: incomplete — timeout after 314000 ms\n\n### Blocking — partial\n\nchanges-requested\n');
        return { status: 'incomplete', reason: 'timeout after 314000 ms', output: options.output, usd: 0.4, export: { scope: 'plan', files: 4 } };
      } });
    assert.equal(result.ok, false);
    assert.equal(result.stopped.bound, 'review');
    assert.match(result.stopped.detail, /timeout after 314000 ms/);
    assert.deepEqual(d.calls.turns.map((t) => t.phase), ['implement'], 'no repair turn on a verdict nobody gave');
    assert.equal(d.calls.prs.length, 0);
    // Resumable: the review is not recorded as completed, so a resume runs it again.
    assert.ok(!readState(d.cfg, SLUG).completed.includes('review'));
  } finally { d.s.cleanup(); }
});

// MEASURED, the G24 pilot on `calculator` 2026-09-16, run 3: `reviewVerdict` counted `## Blocking`
// as a finding rather than as the heading above one. A review that opened `## Blocking` / `None.`
// and closed `changes-requested` over a single Important item bought a repair turn; the repair
// anchored one assertion to the wrong argument, `--stage stop` caught it, and a change that had
// passed every check was not delivered at all. USD 0.546 for nothing, against native's 0.138 for a
// shipped change.
test('a review section that says None holds no findings, and only a blocking finding buys a repair turn', () => {
  const none = reviewVerdict('## Blocking\n\nNone.\n\n## Important\n\n### 1. Vacuous assertions\n\nbody\n\n`changes-requested`\n');
  assert.equal(none.verdict, 'changes-requested', "the reviewer's own last word is preserved");
  assert.equal(none.blocking, 0, '"None." under a heading is an empty category, not an item');
  assert.deepEqual(none.findings, [], 'and it is not handed to a repair turn as a finding');

  const blocking = reviewVerdict('## Blocking\n\n**1. The tests are vacuous** — src/calc.test.ts:56\n\nbody\n\n`changes-requested`\n');
  assert.equal(blocking.blocking, 1, 'a section with an item in it still blocks');
  assert.equal(blocking.findings.length, 1);

  for (const empty of ['None', 'n/a', 'Nothing.', '—']) {
    assert.equal(reviewVerdict(`## Blocking\n\n${empty}\n\n\`changes-requested\`\n`).blocking, 0, empty);
  }
  assert.equal(reviewVerdict('## Blocking\n\nNone.\n\n`approve`\n').verdict, 'approve');
});
