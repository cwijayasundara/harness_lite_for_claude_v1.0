// G25. The playbook's own numbers, each from evidence the harness already writes.
//
// The property every one of these shares, and the only one worth testing hard: a metric with too
// little behind it says so instead of producing a number. A rate over three events is an anecdote
// with a decimal point, and a number closes the question that a gap would have invited.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  firstPassChecks, artifactTransition, reworkCycles, planToPr, specChurn, escapedVersusCaught,
  repeatClasses, contributionTrend, deliveredChanges, metrics, render, MIN_SAMPLE,
} from '../.claude/harness/lib/metrics.mjs';
import { render as renderArtifact } from '../.claude/harness/lib/artifacts.mjs';
import { layout } from '../.claude/harness/lib/paths.mjs';

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'metrics-'));
  const L = layout(root);
  mkdirSync(L.state, { recursive: true });
  mkdirSync(L.artifacts, { recursive: true });
  const git = (...a) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...a], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'm@example.invalid');
  git('config', 'user.name', 'Metrics');
  return { root, L, git, cfg: { layout: L }, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const rows = (list) => list.map((r) => ({ ts: new Date().toISOString(), ...r }));

test('a proportion with too little behind it is unmeasured, not a number', () => {
  // Four check invocations, three of them green. 75% would be a defensible-looking lie.
  const thin = firstPassChecks(rows([
    { kind: 'check-invocation', stage: 'stop', ok: true }, { kind: 'check-invocation', stage: 'stop', ok: true },
    { kind: 'check-invocation', stage: 'stop', ok: true }, { kind: 'check-invocation', stage: 'stop', ok: false },
  ]));
  assert.equal(thin.value, null);
  assert.match(thin.why, new RegExp(`4 of a needed ${MIN_SAMPLE}`));

  const enough = firstPassChecks(rows(Array.from({ length: 10 }, (_, i) => ({ kind: 'check-invocation', stage: 'stop', ok: i < 7 }))));
  assert.equal(enough.value, 0.7);
  assert.equal(enough.of, 10);

  // `fast` runs constantly and is not a CI pass, so counting it would drown the signal it measures.
  const withFast = firstPassChecks(rows([
    ...Array.from({ length: 20 }, () => ({ kind: 'check-invocation', stage: 'fast', ok: true })),
    ...Array.from({ length: 6 }, (_, i) => ({ kind: 'check-invocation', stage: 'commit', ok: i < 3 })),
  ]));
  assert.equal(withFast.of, 6);
  assert.equal(withFast.value, 0.5);
});

test('artifact transitions use first Git commits and refuse a thin sample', () => {
  const r = repo();
  try {
    for (let i = 0; i < MIN_SAMPLE; i++) {
      const dir = path.join(r.L.artifacts, `c${i}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'intent.md'), '# intent\n');
      r.git('add', '.'); r.git('commit', '-qm', `intent ${i}`);
      writeFileSync(path.join(dir, 'spec.md'), '# spec\n');
      r.git('add', '.'); r.git('commit', '-qm', `spec ${i}`);
    }
    const result = artifactTransition(r.cfg, 'intent', 'spec');
    assert.equal(result.of, MIN_SAMPLE);
    assert.ok(result.value >= 0);
    assert.match(artifactTransition(r.cfg, 'spec', 'plan').why, /0 of a needed/);
  } finally { r.cleanup(); }
});

test('rework and lead time come from the driver phase records, or say they cannot', () => {
  const r = repo();
  try {
    assert.match(reworkCycles(r.cfg).why, /no change has been delivered/);
    assert.match(planToPr(r.cfg).why, /no change has been delivered/);

    const write = (slug, state) => {
      const dir = path.join(r.L.state, 'deliver', slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'phases.json'), JSON.stringify(state));
    };
    write('one', { repairs: 0, events: [{ phase: 'pr', event: 'end', at: '2026-09-13T12:00:00.000Z' }] });
    write('two', { repairs: 2, events: [{ phase: 'pr', event: 'end', at: '2026-09-13T18:00:00.000Z' }] });
    assert.deepEqual(reworkCycles(r.cfg), { value: 1, of: 2 });

    // Lead time needs both ends: the approval's own timestamp and the driver's PR event.
    assert.match(planToPr(r.cfg).why, /neither|no delivered change has both/);
    for (const [slug, at] of [['one', '2026-09-13T10:00:00.000Z'], ['two', '2026-09-13T16:00:00.000Z']]) {
      const dir = path.join(r.L.artifacts, slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'plan.md'), renderArtifact({ status: 'approved', by: 'tester', at }, '# Plan\n'));
    }
    const lead = planToPr(r.cfg);
    assert.equal(lead.value, 2, 'two hours for each, so a two-hour median');
    assert.equal(lead.unit, 'hours (median)');

    // A half-written phases.json is not a data point and must not take the command down with it.
    // Written raw: through `write` it would be JSON.stringify'd into a valid JSON *string*.
    mkdirSync(path.join(r.L.state, 'deliver', 'broken'), { recursive: true });
    writeFileSync(path.join(r.L.state, 'deliver', 'broken', 'phases.json'), '{ not json');
    assert.equal(reworkCycles(r.cfg).of, 2);
  } finally { r.cleanup(); }
});

test('a spec that moved after its plan bound it is counted, and one that did not is not', () => {
  const r = repo();
  try {
    // What `approve()` writes: the spec carries its own body digest, and the plan carries the
    // digest of the spec it was approved against. Equal means the spec has not moved since.
    const change = (slug, { specDigest, boundDigest }) => {
      const dir = path.join(r.L.artifacts, slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'intent.md'), `# ${slug}\n`);
      writeFileSync(path.join(dir, 'spec.md'), renderArtifact(
        { status: 'approved', by: 't', at: '2026-09-13T00:00:00.000Z', digest: specDigest }, `# Spec ${slug}\n\n### B1\nSomething.\n`));
      writeFileSync(path.join(dir, 'plan.md'), renderArtifact(
        { status: 'approved', by: 't', at: '2026-09-13T01:00:00.000Z', spec_digest: boundDigest }, '# Plan\n'));
    };
    // Five changes, so the sample is large enough to report at all. Two bind a digest the spec no
    // longer has, which is what "the spec moved after the plan was written" looks like on disk.
    for (let i = 0; i < 5; i++) {
      const specDigest = `sha256:spec-${i}`;
      change(`c${i}`, { specDigest, boundDigest: i < 2 ? 'sha256:an-older-spec' : specDigest });
    }
    const churn = specChurn(r.cfg);
    assert.equal(churn.of, 5);
    assert.equal(churn.value, 0.4, 'two of five specs moved after their plan bound them');

    // A plan that binds no spec digest is not evidence either way and is not counted.
    const dir = path.join(r.L.artifacts, 'unbound');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'intent.md'), '# unbound\n');
    writeFileSync(path.join(dir, 'plan.md'), renderArtifact({ status: 'approved', by: 't', at: 'x' }, '# Plan\n'));
    assert.equal(specChurn(r.cfg).of, 5, 'a plan with no spec_digest was counted');
  } finally { r.cleanup(); }
});

test('escaped versus caught counts what got out against what a rule stopped', () => {
  const r = repo();
  try {
    const caught = rows(Array.from({ length: 6 }, () => ({ verdict: 'fail', rule: 'write-scope' })));
    // Nothing escaped: every defect was caught by a control.
    assert.equal(escapedVersusCaught(r.cfg, caught).value, 0);

    // An incident recorded as a permanent eval is one that got out.
    const pending = path.join(r.L.harness, 'evals', 'pending');
    mkdirSync(pending, { recursive: true });
    for (const id of ['leak', 'timeout']) writeFileSync(path.join(pending, `${id}.json`), '{}');
    const mixed = escapedVersusCaught(r.cfg, caught);
    assert.equal(mixed.escaped, 2);
    assert.equal(mixed.caught, 6);
    assert.equal(mixed.value, 0.25);

    assert.equal(escapedVersusCaught(r.cfg, rows([{ verdict: 'fail', rule: 'x' }])).value, null,
      'three events is not a defect rate');
  } finally { r.cleanup(); }
});

test('repeat classes rank the rules that keep firing', () => {
  const ranked = repeatClasses(rows([
    ...Array.from({ length: 5 }, () => ({ verdict: 'fail', rule: 'init-force' })),
    ...Array.from({ length: 3 }, () => ({ verdict: 'fail', rule: 'stale-map' })),
    { verdict: 'fail', rule: 'write-scope' },
    { verdict: 'pass', rule: 'ignored-because-it-passed' },
  ]));
  assert.deepEqual(ranked.value, [
    { rule: 'init-force', fires: 5 }, { rule: 'stale-map', fires: 3 }, { rule: 'write-scope', fires: 1 },
  ]);
  assert.equal(ranked.of, 9, 'a passing row is not a fire');
  assert.match(repeatClasses([]).why, /no rule has fired/);
});

test('the contribution trend reads the recorded run, and never invents one', () => {
  const r = repo();
  try {
    assert.match(contributionTrend(r.root).why, /no contribution record/);
    const dir = path.join(r.root, 'evals', 'evidence');
    mkdirSync(dir, { recursive: true });

    writeFileSync(path.join(dir, 'contribution.json'), '{ not json');
    assert.match(contributionTrend(r.root).why, /not readable JSON/);

    // A run that measured nothing in both arms has no mean, and must not report one.
    writeFileSync(path.join(dir, 'contribution.json'), JSON.stringify({ aggregates: { meanDelta: null, measured: 0 } }));
    assert.match(contributionTrend(r.root).why, /measured no case in both arms/);

    writeFileSync(path.join(dir, 'contribution.json'), JSON.stringify({ at: 'now', aggregates: { meanDelta: 0.25, measured: 12 } }));
    assert.equal(contributionTrend(r.root).value, 0.25);
    assert.equal(contributionTrend(r.root).of, 12);
  } finally { r.cleanup(); }
});

test('delivered changes are counted from the trailer the driver writes, not from a second store', () => {
  const r = repo();
  try {
    writeFileSync(path.join(r.root, 'a.txt'), 'a');
    r.git('add', '-A');
    r.git('commit', '-qm', 'ordinary work with no trailer');
    assert.match(deliveredChanges(r.root).why, /no commit in 30 days carries a Harness-Change/);

    writeFileSync(path.join(r.root, 'b.txt'), 'b');
    r.git('add', '-A');
    r.git('commit', '-qm', 'a delivered change\n\nHarness-Change: widget-rename');
    writeFileSync(path.join(r.root, 'c.txt'), 'c');
    r.git('add', '-A');
    r.git('commit', '-qm', 'a follow-up to the same change\n\nHarness-Change: widget-rename');
    // One change, two commits: the trailer names the change, and a change delivered over two
    // commits is still one change.
    assert.equal(deliveredChanges(r.root).value, 1);
  } finally { r.cleanup(); }
});

test('the rendered report shows every metric, and says plainly when one is unmeasured', () => {
  const r = repo();
  try {
    const m = metrics(r.cfg, { days: 30 });
    const text = render(m);
    for (const label of ['first-pass checks', 'intent to spec', 'spec to plan', 'rework cycles / change', 'plan approval to PR',
      'spec edits after plan', 'escaped of all defects', 'eval contribution', 'changes delivered', 'repeat classes']) {
      assert.ok(text.includes(label), `${label} is missing from the report`);
    }
    // An empty repository measures nothing, and the report is a list of reasons rather than zeros.
    assert.match(text, /unmeasured —/);
    assert.doesNotMatch(text, /NaN|undefined|null/);
    assert.match(text, /anecdote with a decimal point/);
  } finally { r.cleanup(); }
});
