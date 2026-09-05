// the-suite-measures-this-harness. F16/F18/F19 are one omission in three places: lean-v2 changed
// the artifact model and nothing downstream was re-checked. This is that re-check, made
// permanent: the three golden tasks that named a path the harness no longer writes, the campaign
// check that only ever saw three of twenty-four specs as promises, the summary line that let a
// cheaper run read as good news while tasks aborted, and the gate that would have graded a
// post-migration harness against a pre-migration baseline forever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadTasks, validate, runSuite, summaryLine } from '../evals/run.mjs';
import { evaluate } from '../evals/lib/assertions.mjs';
import { stage } from '../evals/lib/stage.mjs';
import { gate, predatesArtifactModel, ARTIFACT_MODEL_COMMIT, RECORD_SCHEMA } from '../.aidlc/lib/eval-gate.mjs';
import { promiseSpecs, render } from '../.aidlc/lib/artifacts.mjs';
import { A, ROOT, BIN } from './_paths.mjs';

const FIXTURES = path.join(ROOT, 'evals', 'fixtures');
const HARNESS = path.join(A, 'bin', 'harness');

// --- B1 -------------------------------------------------------------------------------------
// The three tasks that used to write `.aidlc/artifacts/contracts/<name>.md` via a command
// (`harness contract new`) that no longer exists. Repointed to `harness new` and the three-file
// chain; each is checked here against real chain output, not a hand-typed guess at its shape.

function harnessNew(work, slug) {
  const r = spawnSync('node', [HARNESS, 'new', slug], { cwd: work, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
}

test('B1: the three repointed tasks name no path under .aidlc/artifacts/contracts/, and their prompts no longer invoke the retired command', () => {
  const tasks = loadTasks();
  for (const id of ['contract-is-testable', 'contract-names-owned-files', 'successor-contract-links-first']) {
    const task = tasks.find((t) => t.id === id);
    assert.ok(task, `${id} still exists in tasks.json`);
    assert.doesNotMatch(task.prompt, /contract new/, `${id}'s prompt still invokes the retired \`harness contract new\``);
    for (const a of task.assert) {
      const [name, value] = Object.entries(a)[0];
      const paths = name === 'files_unchanged' ? value : name === 'file_exists' ? [value] : Array.isArray(value) ? [value[0]] : [];
      for (const p of paths.filter((p) => p.startsWith('.aidlc/artifacts'))) {
        assert.doesNotMatch(p, /^\.aidlc\/artifacts\/contracts\//, `${id}: ${p} still names the retired single-file contract path`);
        assert.match(p, /^\.aidlc\/artifacts\/[a-z0-9-]+\/(intent|spec|plan|review)\.md$/, `${id}: ${p} does not name a path the three-file chain produces`);
      }
    }
  }
  const problems = validate(tasks, FIXTURES);
  assert.deepEqual(problems, []);
});

test('B1: contract-is-testable — its assertions pass against a real spec.md the chain produces', () => {
  const task = loadTasks().find((t) => t.id === 'contract-is-testable');
  const s = stage(FIXTURES, task.fixture);
  try {
    harnessNew(s.work, 'search-latency');
    const specFile = path.join(s.work, '.aidlc/artifacts/search-latency/spec.md');
    const body = readFileSync(specFile, 'utf8')
      .replace('<The observable result, in the language of the affected user.>', 'Search latency is reduced for enterprise tenants.')
      .replace('Given ...\nWhen ...\nThen ...', 'Given a search request from an enterprise tenant\nWhen it is served\nThen p95 latency is under one second')
      .replace('<Explicit boundaries. What a reader might reasonably expect and will not get.>', 'Non-enterprise tenants, and any change to the search index.');
    writeFileSync(specFile, body);
    for (const a of task.assert) {
      const [r] = evaluate({ work: s.work }, [a]);
      assert.equal(r.pass, true, r.detail);
    }
  } finally { s.cleanup(); }
});

test('B1: contract-names-owned-files — its assertions pass against a real plan.md the chain produces', () => {
  const task = loadTasks().find((t) => t.id === 'contract-names-owned-files');
  const s = stage(FIXTURES, task.fixture);
  try {
    harnessNew(s.work, 'health-endpoint');
    const planFile = path.join(s.work, '.aidlc/artifacts/health-endpoint/plan.md');
    const body = readFileSync(planFile, 'utf8').replace('- `path/to/file`', '- `src/app/health.py`\n- `tests/test_health.py`');
    writeFileSync(planFile, body);
    for (const a of task.assert) {
      const [r] = evaluate({ work: s.work }, [a]);
      assert.equal(r.pass, true, r.detail);
    }
  } finally { s.cleanup(); }
});

test('B1: successor-contract-links-first — its assertions pass against a real intent.md and plan.md the chain produces, and the predecessor file is untouched', () => {
  const task = loadTasks().find((t) => t.id === 'successor-contract-links-first');
  const s = stage(FIXTURES, task.fixture); // contract-planned — already carries the migrated hyphen-titlecase chain
  try {
    harnessNew(s.work, 'family-sort-key');
    const intentFile = path.join(s.work, '.aidlc/artifacts/family-sort-key/intent.md');
    writeFileSync(intentFile, readFileSync(intentFile, 'utf8')
      .replace('<What is wrong today, in the language of whoever feels it. No solution here.>', 'Family names with multiple parts do not sort correctly. Follows on from the shipped hyphen-titlecase change.')
      .replace('<What is true when this is done. Observable from outside the system.>', 'Names sort by family name regardless of hyphenation.'));
    const planFile = path.join(s.work, '.aidlc/artifacts/family-sort-key/plan.md');
    writeFileSync(planFile, readFileSync(planFile, 'utf8').replace('- `path/to/file`', '- `src/app/sort_key.py`'));
    for (const a of task.assert) {
      const [r] = evaluate({ work: s.work, pristine: s.pristine }, [a]);
      assert.equal(r.pass, true, r.detail);
    }
  } finally { s.cleanup(); }
});

// --- B2 -------------------------------------------------------------------------------------
// `promiseSpecs()` answers "is this a promise the code must keep" (approved, or migrated_from);
// `approve()` keeps answering "may a plan be gated against this" (approved, full stop, untouched).
// The same artifact, both questions, opposite answers for the migrated case.

const run = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-suite-truth-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 'harness@example.invalid'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Harness Test'], { cwd: root });
  assert.equal(run(root, 'init', '--into', root).status, 0);
  return root;
}

function commit(root, message) {
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', message], { cwd: root });
}

const specPath = (root, slug) => path.join(root, '.aidlc/artifacts', slug, 'spec.md');
const planPath = (root, slug) => path.join(root, '.aidlc/artifacts', slug, 'plan.md');

function realSpec(ids, front = {}) {
  const behaviours = ids.map((id) => `### ${id}\n\nGiven a real precondition for ${id}\nWhen the matching action happens\nThen a real, specific result follows\n`).join('\n');
  const body = `# Spec: demo\n\n## Outcome\n\nA concrete, observable result stated in the language of the affected user.\n\n## Observable behaviours\n\n${behaviours}\n## Out of scope\n\nEverything not named above.\n\n## Safeguards\n\nNone beyond what the behaviours already state.\n`;
  return render({ status: 'draft', ...front }, body);
}

function realPlan(ids) {
  const table = ids.map((id) => `| ${id} | see \`suite-truth.test.mjs\` |`).join('\n');
  return `---\nstatus: draft\n---\n# Plan: demo\n\n## Approach\n\nA concrete approach, and the alternative not taken.\n\n## Files\n\n- \`demo.txt\`\n\n## Order\n\n1. Write \`demo.txt\`.\n\n## Proof\n\n| Behaviour | Test or evidence |\n|---|---|\n${table}\n`;
}

test('B2: a migrated_from spec is a promise and is not gateable; an approved spec is both; a draft is neither', () => {
  const root = repo();
  try {
    // migrated: draft status, migrated_from set — lean-v2 invented no approval, on purpose.
    assert.equal(run(root, 'new', 'migrated-thing').status, 0);
    writeFileSync(specPath(root, 'migrated-thing'), realSpec(['B1'], { migrated_from: 'sha256:deadbeef' }));
    commit(root, 'migrated-thing: migrated, no approval');

    // approved: a real Gate 1 decision.
    assert.equal(run(root, 'new', 'approved-thing').status, 0);
    writeFileSync(specPath(root, 'approved-thing'), realSpec(['B1']));
    commit(root, 'approved-thing drafted');
    assert.equal(run(root, 'approve', 'approved-thing', 'spec', '--by', 'tester').status, 0);
    commit(root, 'approved-thing spec approved');

    // draft: never touched by a human or a migration.
    assert.equal(run(root, 'new', 'draft-thing').status, 0);
    writeFileSync(specPath(root, 'draft-thing'), realSpec(['B1']));
    commit(root, 'draft-thing drafted, left unapproved');

    const cfg = { layout: { root, artifacts: path.join(root, '.aidlc/artifacts') } };
    const promises = promiseSpecs(cfg).map((s) => s.slug).sort();
    assert.deepEqual(promises, ['approved-thing', 'migrated-thing'], 'a promise is approved, or carries migrated_from — a plain draft is neither');

    // approve() is untouched: gating a plan needs status === 'approved', full stop. Neither the
    // migrated spec nor the plain draft may gate a plan, for the same reason and the same error.
    const migratedGate = run(root, 'approve', 'migrated-thing', 'plan', '--by', 'tester');
    assert.equal(migratedGate.status, 1);
    assert.match(migratedGate.stderr, /approve the spec before the plan/, 'migrated_from is not an approval approve() will gate against');

    const draftGate = run(root, 'approve', 'draft-thing', 'plan', '--by', 'tester');
    assert.equal(draftGate.status, 1);
    assert.match(draftGate.stderr, /approve the spec before the plan/);

    // approved-thing is gateable: its plan can actually be approved.
    writeFileSync(planPath(root, 'approved-thing'), realPlan(['B1']));
    commit(root, 'approved-thing plan drafted');
    const approvedGate = run(root, 'approve', 'approved-thing', 'plan', '--by', 'tester');
    assert.equal(approvedGate.status, 0, approvedGate.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- B5 -------------------------------------------------------------------------------------
// F19: surgical-fix and test-integrity each had one of three repeats hit the budget ceiling, and
// the task verdict landed on "flaky" — the abort is invisible in a summary that only ever prints
// pass/flaky/fail/inconclusive. `aborted` counts the run itself, not the task's overall verdict.

test('B5: an aborted attempt is counted even when the task verdict is flaky, not inconclusive', async () => {
  let calls = 0;
  const invoke = async () => {
    calls++;
    if (calls === 3) return { transcript: '', usage: { usd: 0.7 }, incomplete: { reason: 'budget_exhausted', detail: 'Reached maximum budget ($0.75)', turns: 40 } };
    return { transcript: 'did it', usage: { usd: 0.1 } };
  };
  const out = await runSuite({
    tasks: [{ id: 'flaky-with-abort', fixture: 'clean-app', timeoutMs: 1000, budgetUsd: 0.75, repeats: 3, assert: [{ workdir_unchanged: true }] }],
    invoke, fixturesDir: FIXTURES, harnessBin: HARNESS,
  });
  assert.equal(out.results[0].verdict, 'flaky', 'two passes and one abort is flaky, not inconclusive');
  assert.equal(out.summary.inconclusive, 0, 'the F19 blind spot: the abort is not visible in inconclusive');
  assert.equal(out.summary.aborted, 1, 'but it is visible in aborted');
});

test('B5: the summary line carries the abort count in the same line as the cost', () => {
  const line = summaryLine({ pass: 11, flaky: 3, fail: 8, inconclusive: 2, aborted: 4, usd: 8.3661 });
  assert.match(line, /4 aborted/);
  assert.match(line, /\$8\.3661/);
});

// --- B6 -------------------------------------------------------------------------------------
// 935372e retired the single-file contract for the three-file chain. `expected.json` was last
// recorded against 4616d9e1, which predates it — grading today's harness against that record
// produced eleven line items that read as regressions and were not (F18, F19).

test('B6: predatesArtifactModel is true only for a baseline before the change, graded against a HEAD after it', () => {
  assert.equal(predatesArtifactModel('4616d9e1a527458748382d0049d1856d664629cb', { cwd: ROOT }), true);
  assert.equal(predatesArtifactModel(ARTIFACT_MODEL_COMMIT, { cwd: ROOT }), false, 'the change commit itself does not predate itself');
  assert.equal(predatesArtifactModel(null, { cwd: ROOT }), false, 'no recorded commit at all is not this case');
});

test('B6: gate reports an incomparable baseline rather than regressions', () => {
  const record = { schema: RECORD_SCHEMA, commit: '4616d9e1a527458748382d0049d1856d664629cb', tasks: { 'surgical-fix': { verdict: 'pass', usd: 0.37 } } };
  const results = { source: 'now.json', results: [{ id: 'surgical-fix', verdict: 'fail', usd: 1.87 }] };
  const r = gate(results, record, { cwd: ROOT });
  assert.equal(r.ok, false);
  assert.match(r.reason, /predates/i);
  assert.deepEqual(r.regressed, [], 'not reported as a regression once the baseline is known to be from before the artifact model changed');
});

test('B6: gate grades normally once the baseline is recorded against a commit that has the artifact model', () => {
  const record = { schema: RECORD_SCHEMA, commit: ARTIFACT_MODEL_COMMIT, tasks: { a: { verdict: 'pass', usd: 0.1 } } };
  const results = { source: 'now.json', results: [{ id: 'a', verdict: 'fail', usd: 0.2 }] };
  const r = gate(results, record, { cwd: ROOT });
  assert.equal(r.ok, false);
  assert.deepEqual(r.regressed.map((x) => x.id), ['a'], 'a genuine regression against a comparable baseline is still reported as one');
});
