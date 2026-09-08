import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { run } from '../.aidlc/checks/scope-drift.mjs';
import { parse, render, bodyDigest, selectChange } from '../.aidlc/lib/artifacts.mjs';
import { FIXTURES, stage } from '../evals/lib/stage.mjs';

const cfg = (root) => ({ layout: { root, artifacts: path.join(root, '.aidlc/artifacts') } });

test('local staged, unstaged, untracked, renamed and deleted paths retain exact scope identity', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const renamed = 'src/app/renamed\twith\nspace.py';
    renameSync(path.join(s.work, 'src/app/text.py'), path.join(s.work, renamed));
    spawnSync('git', ['add', '-A'], { cwd: s.work });
    unlinkSync(path.join(s.work, 'src/app/handlers.py'));
    const untracked = 'src/app/untracked.py';
    writeFileSync(path.join(s.work, untracked), '# untracked\n');
    const result = await run(cfg(s.work));
    const files = result.findings.filter(f => f.rule === 'scope-drift').map(f => f.file);
    assert.ok(files.includes(renamed), 'staged rename destination');
    assert.ok(files.includes('src/app/handlers.py'), 'unstaged deletion');
    assert.ok(files.includes(untracked));
    // The reverse direction must not hide an unowned source under an owned destination.
    spawnSync('git', ['reset', '--hard', 'HEAD'], { cwd: s.work });
    unlinkSync(path.join(s.work, 'src/app/text.py'));
    renameSync(path.join(s.work, 'src/app/handlers.py'), path.join(s.work, 'src/app/text.py'));
    spawnSync('git', ['add', '-A'], { cwd: s.work });
    assert.ok((await run(cfg(s.work))).findings.some(f => f.file === 'src/app/handlers.py'));
  } finally { s.cleanup(); }
});

const commit = (root, message) => {
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', message], { cwd: root });
};

// Simulated approvals followed by an explicit execution selection; timestamps are audit data.
function approvedPlan(root, slug, files, { commitIt = true, at = '2026-09-02T00:00:00.000Z' } = {}) {
  const dir = path.join(root, '.aidlc/artifacts', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'intent.md'), '---\nstatus: draft\n---\n# Intent\n');
  const specDraft = render({ status: 'draft' }, `# Spec: ${slug}\n\n### B1\n\nGiven, when, then.\n`);
  writeFileSync(path.join(dir, 'spec.md'), render({ status: 'approved', by: 'tester', at, digest: bodyDigest(specDraft) }, parse(specDraft).body));
  const body = `# Plan: ${slug}\n\n## Files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
  const file = path.join(dir, 'plan.md');
  writeFileSync(file, `---\nstatus: draft\n---\n${body}`);
  const text = readFileSync(file, 'utf8');
  writeFileSync(file, render({ ...parse(text).front, status: 'approved', by: 'tester', at, digest: bodyDigest(text) }, parse(text).body));
  if (commitIt) commit(root, `plan approved: ${slug}`);
  selectChange(cfg(root), slug);
  return file;
}

test('the approved plan owns the working diff', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    writeFileSync(path.join(s.work, 'src/app/text.py'), '# in plan\n');
    assert.equal((await run(cfg(s.work))).verdict, 'pass');

    writeFileSync(path.join(s.work, 'src/app/handlers.py'), '# outside plan\n');
    const result = await run(cfg(s.work));
    assert.equal(result.verdict, 'fail');
    assert.equal(result.findings[0].rule, 'scope-drift');
    assert.match(result.findings.map((f) => f.file).join(' '), /handlers\.py/);
  } finally { s.cleanup(); }
});

// a-diff-belongs-to-one-change B5. This test used to assert the opposite: that a file owned by
// *any* approved committed plan was in scope. That is the rule F10 and F26 were routed through —
// sprint 3 wrote product code under sprint 2's plan, and a generator edited a file under a change
// closed two days earlier. Ownership is a property of the explicitly selected change,
// and the guard reads the same function, so the two
// cannot disagree the way they did.
test('only the current change\'s plan owns the working diff; an older plan\'s file is a finding', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    writeFileSync(path.join(s.work, 'src/app/second.py'), '# owned by the newer plan\n');
    approvedPlan(s.work, 'second-change', ['src/app/second.py']);

    // The newer change is current. Its own file passes.
    writeFileSync(path.join(s.work, 'src/app/second.py'), '# edited again\n');
    assert.equal((await run(cfg(s.work))).verdict, 'pass');

    // The older plan's file is a finding, and the finding names the change actually being made.
    writeFileSync(path.join(s.work, 'src/app/text.py'), '# owned by the older plan\n');
    const older = await run(cfg(s.work));
    assert.equal(older.verdict, 'fail');
    const finding = older.findings.find((f) => f.file === 'src/app/text.py');
    assert.equal(finding.rule, 'scope-drift');
    assert.match(finding.message, /second-change/);
  } finally { s.cleanup(); }
});

// B5: a diff with no valid selection reports that selection problem rather
// than `no-approved-plan`, which would send the agent to approve a plan for a change that is not
// current. B3's shape: a current change whose plan is not approved is `no-approved-plan`.
test('no current change is a different finding from an unapproved plan', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    // Close the fixture's only change: nothing is current.
    const intent = path.join(s.work, '.aidlc/artifacts/hyphen-titlecase/intent.md');
    writeFileSync(intent, readFileSync(intent, 'utf8').replace('status: draft', 'status: closed'));
    commit(s.work, 'close hyphen-titlecase');
    writeFileSync(path.join(s.work, 'src/app/text.py'), '# no current change\n');
    const none = await run(cfg(s.work));
    assert.equal(none.verdict, 'fail');
    assert.equal(none.findings[0].rule, 'no-current-change');

    // A newer change with an approved spec and a draft plan is current, and governs nothing.
    approvedPlan(s.work, 'sprint-3', ['src/app/text.py']);
    const plan = path.join(s.work, '.aidlc/artifacts/sprint-3/plan.md');
    writeFileSync(plan, render({ status: 'draft' }, parse(readFileSync(plan, 'utf8')).body));
    commit(s.work, 'sprint-3 plan back to draft');
    // The commits above swept the earlier edit in; scope-drift judges the working diff.
    writeFileSync(path.join(s.work, 'src/app/text.py'), '# edited under an unapproved plan\n');
    const unapproved = await run(cfg(s.work));
    assert.equal(unapproved.verdict, 'fail');
    assert.equal(unapproved.findings[0].rule, 'no-approved-plan');
    assert.match(unapproved.findings[0].message, /sprint-3/);
  } finally { s.cleanup(); }
});

// B4. An approval nobody committed is not an auditable gate, and an approved plan edited after
// approval is a stale approval — neither may authorise a diff.
test('an uncommitted or stale approval owns nothing', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    writeFileSync(path.join(s.work, 'src/app/late.py'), '# claimed by an uncommitted plan\n');
    approvedPlan(s.work, 'uncommitted', ['src/app/late.py'], { commitIt: false });
    const uncommitted = await run(cfg(s.work));
    assert.equal(uncommitted.verdict, 'fail');
    assert.match(uncommitted.findings.map((f) => f.file).join(' '), /late\.py/);

    // Commit it, and the same diff passes.
    commit(s.work, 'plan approved: uncommitted');
    assert.equal((await run(cfg(s.work))).verdict, 'pass');

    // Now widen the plan's body without re-approving. The digest no longer matches, so the plan
    // stops governing — a plan cannot grant itself scope after a human signed it.
    const plan = path.join(s.work, '.aidlc/artifacts/uncommitted/plan.md');
    writeFileSync(plan, readFileSync(plan, 'utf8').replace('## Files', '## Files\n\n- `src/app/`'));
    commit(s.work, 'widen the plan without re-approving');

    // A fresh edit to the file that plan claimed. scope-drift measures the working diff, so the
    // change has to be uncommitted for there to be anything to judge.
    writeFileSync(path.join(s.work, 'src/app/late.py'), '# edited under a stale approval\n');
    const stale = await run(cfg(s.work));
    assert.equal(stale.verdict, 'fail', 'a stale approval must not govern');
    assert.match(stale.findings.map((f) => f.file).join(' '), /late\.py/);
  } finally { s.cleanup(); }
});

// a-draft-is-a-declaration B3: the check asks the same question as the guard.
test('a selected draft spec makes every product change a draft-awaits-gate finding', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const dir = path.join(s.work, '.aidlc/artifacts/paid-never-overdue');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'intent.md'), '---\nstatus: draft\n---\n# Intent\n');
    writeFileSync(path.join(dir, 'spec.md'), render({ status: 'draft' }, '# Spec\n\n### B1\n\nGiven a paid invoice\nWhen isOverdue is asked\nThen it answers false\n'));
    commit(s.work, 'a declaration, not yet gated');
    selectChange(cfg(s.work), 'paid-never-overdue');
    writeFileSync(path.join(s.work, 'src/app/text.py'), '# written under a waiting draft\n');
    const r = await run(cfg(s.work));
    assert.equal(r.verdict, 'fail');
    assert.equal(r.findings[0].rule, 'draft-awaits-gate');
    assert.match(r.findings[0].message, /paid-never-overdue/);
  } finally { s.cleanup(); }
});

// an-edited-approval-awaits-its-gate B4: the check asks the same question as the guard.
test('an edited approved spec makes every product change a draft-awaits-gate finding naming the artifact', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const spec = path.join(s.work, '.aidlc/artifacts/hyphen-titlecase/spec.md');
    writeFileSync(spec, readFileSync(spec, 'utf8') + '\nedited after approval\n');
    commit(s.work, 'edited an approved spec');
    writeFileSync(path.join(s.work, 'src/app/text.py'), '# written under a stale approval\n');
    const r = await run(cfg(s.work));
    assert.equal(r.verdict, 'fail');
    assert.equal(r.findings[0].rule, 'draft-awaits-gate');
    assert.match(r.findings[0].message, /hyphen-titlecase.*spec\.md/);
  } finally { s.cleanup(); }
});
