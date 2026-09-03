import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { run } from '../.aidlc/checks/scope-drift.mjs';
import { parse, render, bodyDigest } from '../.aidlc/lib/artifacts.mjs';
import { FIXTURES, stage } from '../evals/lib/stage.mjs';

const cfg = (root) => ({ layout: { root, artifacts: path.join(root, '.aidlc/artifacts') } });

const commit = (root, message) => {
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', message], { cwd: root });
};

// A plan as a human would leave it: approved, digested, committed.
function approvedPlan(root, slug, files, { commitIt = true } = {}) {
  const dir = path.join(root, '.aidlc/artifacts', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'intent.md'), '---\nstatus: draft\n---\n# Intent\n');
  const body = `# Plan: ${slug}\n\n## Files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
  const file = path.join(dir, 'plan.md');
  writeFileSync(file, `---\nstatus: draft\n---\n${body}`);
  const text = readFileSync(file, 'utf8');
  writeFileSync(file, render({ ...parse(text).front, status: 'approved', by: 'tester', at: '2026-09-01T00:00:00.000Z', digest: bodyDigest(text) }, parse(text).body));
  if (commitIt) commit(root, `plan approved: ${slug}`);
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

// scope-drift-reads-every-contract B1/B2/B4/B6, carried into the three-file chain. Ownership is a
// property of the repository, not of whichever artifact was edited last: reading it off the most
// recently modified one made the check disagree with the write guard, and recording a file owned
// by one plan failed because another happened to have a newer mtime.
test('a file owned by any approved committed plan is in scope, whichever is newest', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    writeFileSync(path.join(s.work, 'src/app/second.py'), '# owned by the newer plan\n');
    approvedPlan(s.work, 'second-change', ['src/app/second.py']);

    // Both plans govern. The older one still authorises the file it owns.
    writeFileSync(path.join(s.work, 'src/app/text.py'), '# owned by the older plan\n');
    writeFileSync(path.join(s.work, 'src/app/second.py'), '# edited again\n');
    assert.equal((await run(cfg(s.work))).verdict, 'pass');

    // A file no plan claims is still a finding.
    writeFileSync(path.join(s.work, 'src/app/orphan.py'), '# owned by no plan at all\n');
    const orphan = await run(cfg(s.work));
    assert.equal(orphan.verdict, 'fail');
    assert.match(orphan.findings.map((f) => f.file).join(' '), /orphan\.py/);
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
