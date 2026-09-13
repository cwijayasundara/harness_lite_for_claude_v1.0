// G07. Spec approval no longer requires intent provenance.
//
// `source` and `source_revision` were mandatory, and the cost was not theoretical: a control-band
// breach, a PRD paragraph and an incident report are all legitimate origins for a change, and
// none of them is a committed blob in this repository at a revision anybody can name in advance.
// `examples/maintain/band-to-intent.mjs` writes an intent with `status: draft` and nothing else,
// so the maintain edge could not reach its own first gate — failing closed on a field rather than
// on a judgment.
//
// What this file measures: an intent that declares nothing reaches an approved spec and plan and
// records `unbound`; an intent that declares a source is bound exactly as before and still goes
// stale when the source moves; a Requirements table is validated when it is there and not
// demanded when it is not; and `approve` still refuses an uncommitted artifact.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig } from '../.aidlc/lib/config.mjs';
import * as a from '../.aidlc/lib/artifacts.mjs';
import { ROOT, BIN } from './_paths.mjs';

const run = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });
// Deliberately NOT `traceFixture`. That helper injects a fabricated `source:` and a Requirements
// table into every draft it finds — it exists because approval used to demand both, and running
// it here would hand these tests the very fields they are here to do without.
const commit = (root, message) => {
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', message], { cwd: root });
};

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'provenance-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 'harness@example.invalid'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Harness Test'], { cwd: root });
  assert.equal(run(root, 'init', '--into', root).status, 0);
  return root;
}

// The shortest text that is not the scaffold. `approve` refuses an untouched placeholder, and
// that refusal is not what this file is about.
const SPEC = (extra = '') => `# Spec: a change with no upstream document

## Outcome

A reader can tell what changed without being told where the idea came from.

## Observable behaviours

### B1

Given an intent that names no source document
When its spec is approved
Then the approval succeeds and records that it is bound to nothing.
${extra}`;

const PLAN = `# Plan: a change with no upstream document

## Approach

Write the behaviour and the test that proves it.

## Files

- \`src/thing.mjs\`

## Order

1. Write \`src/thing.mjs\`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | \`tests/thing.test.mjs\` |
`;

function draft(root, slug, { spec = SPEC(), intentFront = 'status: draft' } = {}) {
  assert.equal(run(root, 'new', slug).status, 0);
  const dir = path.join(root, '.aidlc/artifacts', slug);
  writeFileSync(path.join(dir, 'intent.md'), `---\n${intentFront}\n---\n# Intent: ${slug}\n\nSomething should change.\n`);
  writeFileSync(path.join(dir, 'spec.md'), `---\nstatus: draft\n---\n${spec}`);
  writeFileSync(path.join(dir, 'plan.md'), `---\nstatus: draft\n---\n${PLAN}`);
}

test('an intent with no frontmatter beyond status reaches an approved spec and plan', () => {
  const root = repo();
  try {
    draft(root, 'no-upstream-document');
    commit(root, 'draft no-upstream-document');

    const spec = run(root, 'approve', 'no-upstream-document', 'spec', '--by', 'tester');
    assert.equal(spec.status, 0, spec.stderr);
    commit(root, 'spec approved');

    const plan = run(root, 'approve', 'no-upstream-document', 'plan', '--by', 'tester');
    assert.equal(plan.status, 0, plan.stderr);
    commit(root, 'plan approved');

    const cfg = loadConfig(root);
    const approvedSpec = a.read(cfg, 'no-upstream-document', 'spec');
    const approvedPlan = a.read(cfg, 'no-upstream-document', 'plan');

    assert.equal(approvedSpec.state, 'approved');
    assert.equal(approvedPlan.state, 'approved');

    // Recorded, not assumed. `unbound` is a v2 approval that verified everything there was to
    // verify; `legacy/unbound` is an approval from before the binding existed and verified
    // nothing. A reader has to be able to tell those apart.
    assert.equal(approvedSpec.binding, 'unbound');
    assert.equal(approvedPlan.binding, 'unbound');
    assert.equal(approvedSpec.front.source_kind, 'unbound');
    assert.equal(approvedSpec.bindingError, null);
    assert.equal(approvedPlan.bindingError, null);

    // The plan governs, so the loop can actually proceed — an approval that could not carry
    // scope would be an approval in name only.
    assert.deepEqual(a.ownedFiles(approvedPlan.body), ['src/thing.mjs']);
    assert.equal(a.state(cfg, 'no-upstream-document').next, 'implement');

    const status = run(root, 'status', 'no-upstream-document');
    assert.equal(status.status, 0, status.stdout + status.stderr);
    assert.match(status.stdout, /binding: spec unbound, plan unbound/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// The maintain edge's own output, run for real rather than imitated. G19 later closes the rest of
// this loop; G07's claim is only that what the script writes today is approvable as it stands.
test('band-to-intent output is approvable without modification', () => {
  const root = repo();
  try {
    writeFileSync(path.join(root, 'bands.json'), JSON.stringify({
      bands: [{ metric: 'overdue_rate', observed: 0.31, mean: 0.12, stdev: 0.04 }],
    }));
    const wrote = spawnSync(process.execPath, [path.join(ROOT, 'examples/maintain/band-to-intent.mjs'), 'bands.json'], { cwd: root, encoding: 'utf8' });
    assert.equal(wrote.status, 0, wrote.stderr);

    const slug = 'overdue-rate-breach';
    const intent = path.join(root, '.aidlc/artifacts', slug, 'intent.md');
    assert.ok(existsSync(intent), wrote.stdout);
    // Exactly the acceptance: not edited, not given a source, approved as written.
    assert.equal(a.parse(readFileSync(intent, 'utf8')).front.source, undefined);

    mkdirSync(path.join(root, '.aidlc/artifacts', slug), { recursive: true });
    writeFileSync(path.join(root, '.aidlc/artifacts', slug, 'spec.md'), `---\nstatus: draft\n---\n${SPEC()}`);
    writeFileSync(path.join(root, '.aidlc/artifacts', slug, 'plan.md'), `---\nstatus: draft\n---\n${PLAN}`);
    commit(root, 'breach intent and its spec and plan');

    for (const kind of ['spec', 'plan']) {
      const result = run(root, 'approve', slug, kind, '--by', 'operator');
      assert.equal(result.status, 0, `${kind}: ${result.stderr}`);
      commit(root, `${kind} approved`);
    }
    assert.equal(a.read(loadConfig(root), slug, 'plan').state, 'approved');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a Requirements table is validated when present and not demanded when absent', () => {
  const root = repo();
  try {
    // Absent: approved, as the test above already showed, and the spec carries no invented rows.
    draft(root, 'no-table');
    commit(root, 'draft no-table');
    assert.equal(run(root, 'approve', 'no-table', 'spec', '--by', 'tester').status, 0);
    assert.equal(a.hasRequirements(a.read(loadConfig(root), 'no-table', 'spec').body), false);
    commit(root, 'no-table spec approved');

    // Present and broken: refused, exactly as before. Relaxing "must have one" must not relax
    // "the one you have must hold together" — that was the whole value of the check.
    draft(root, 'broken-table', { spec: SPEC('\n## Requirements\n\n| Source criterion | Behaviour IDs |\n|---|---|\n| some criterion | B99 |\n') });
    commit(root, 'draft broken-table');
    const broken = run(root, 'approve', 'broken-table', 'spec', '--by', 'tester');
    assert.equal(broken.status, 1);
    assert.match(broken.stderr, /Requirements/);

    // Present and sound: approved, and the rows are readable by everything downstream.
    draft(root, 'good-table', { spec: SPEC('\n## Requirements\n\n| Source criterion | Behaviour IDs |\n|---|---|\n| some criterion | B1 |\n') });
    commit(root, 'draft good-table');
    const good = run(root, 'approve', 'good-table', 'spec', '--by', 'tester');
    assert.equal(good.status, 0, good.stderr);
    const rows = a.requirementRows(a.read(loadConfig(root), 'good-table', 'spec').body);
    assert.deepEqual(rows, [{ criterion: 'some criterion', behaviours: ['B1'] }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('what G07 did not relax: a committed artifact, a resolvable source, and a source that moved', () => {
  const root = repo();
  try {
    draft(root, 'still-strict');

    // Uncommitted is still refused. An approval of a working copy is an approval of something no
    // reviewer can read and no history records.
    const early = run(root, 'approve', 'still-strict', 'spec', '--by', 'tester');
    assert.equal(early.status, 1);
    assert.match(early.stderr, /commit .*spec\.md before approving/);
    commit(root, 'draft still-strict');

    // A source declared but unresolvable is still refused: the relaxation is about declaring
    // nothing, never about declaring something false.
    const intent = path.join(root, '.aidlc/artifacts/still-strict/intent.md');
    const bare = readFileSync(intent, 'utf8');
    for (const front of [
      'status: draft\nsource: ../outside.md\nsource_revision: HEAD',
      'status: draft\nsource: missing.md\nsource_revision: HEAD',
      'status: draft\nsource: src/thing.mjs',
    ]) {
      writeFileSync(intent, `---\n${front}\n---\n# Intent\n\nSomething should change.\n`);
      commit(root, 'intent with a broken source declaration');
      const result = run(root, 'approve', 'still-strict', 'spec', '--by', 'tester');
      assert.equal(result.status, 1, `approved a broken declaration: ${front}`);
      assert.match(result.stderr, /source/);
    }

    // A source declared and resolvable binds, and moving it makes the approval stale — unchanged
    // by G07, which relaxed what must be declared and nothing about what a declaration means.
    writeFileSync(path.join(root, 'requirements.md'), '# Requirements\n\nThe first version.\n');
    commit(root, 'add the source document');
    const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    writeFileSync(intent, `---\nstatus: draft\nsource: requirements.md\nsource_revision: ${revision}\n---\n# Intent\n\nSomething should change.\n`);
    commit(root, 'bind the intent to its source');

    assert.equal(run(root, 'approve', 'still-strict', 'spec', '--by', 'tester').status, 0);
    commit(root, 'spec approved against a real source');
    const bound = a.read(loadConfig(root), 'still-strict', 'spec');
    assert.equal(bound.binding, 'v2');
    assert.equal(bound.front.source_kind, 'repository');
    assert.match(bound.front.source_digest, /^sha256:/);

    // The binding pins a revision, so the approval survives the document changing *after* it —
    // that is what pinning is for, and it is unchanged by G07.
    writeFileSync(path.join(root, 'requirements.md'), '# Requirements\n\nThe second version.\n');
    commit(root, 'the source document moves at HEAD');
    assert.equal(a.read(loadConfig(root), 'still-strict', 'spec').state, 'approved',
      'a pinned revision is not invalidated by later edits to the file');

    // Repointing the intent at the new revision is a changed input, and that still invalidates
    // the approval: what a human approved is no longer what the intent says.
    const moved = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    writeFileSync(intent, `---\nstatus: draft\nsource: requirements.md\nsource_revision: ${moved}\n---\n# Intent\n\nSomething should change.\n`);
    commit(root, 'repoint the intent at the new revision');
    const repointed = a.read(loadConfig(root), 'still-strict', 'spec');
    assert.equal(repointed.state, 'stale-approval', 'a changed source declaration is still a stale approval');
    assert.equal(repointed.binding, 'invalid');
    assert.ok(repointed.bindingError, 'and it says which input moved');

    // Restoring the exact approved declaration restores the approval: staleness is a comparison,
    // never a one-way latch.
    writeFileSync(intent, `---\nstatus: draft\nsource: requirements.md\nsource_revision: ${revision}\n---\n# Intent\n\nSomething should change.\n`);
    commit(root, 'restore the approved declaration');
    assert.equal(a.read(loadConfig(root), 'still-strict', 'spec').state, 'approved');

    assert.ok(bare.length, 'the bare intent text was read');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
