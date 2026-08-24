import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { run } from '../.claude/checks/plan-drift.mjs';

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'plan-drift-'));
  const plan = path.join(root, '.claude/artifacts/plan');
  mkdirSync(plan, { recursive: true });
  mkdirSync(path.join(root, 'src'), { recursive: true });
  const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'eval@harness');
  git('config', 'user.name', 'eval');
  writeFileSync(path.join(plan, 'old.md'), '# Plan: old\n- **Status:** approved\n\n## Files\n```\nsrc/old.py\n```\n');
  writeFileSync(path.join(root, 'src/old.py'), 'old\n');
  git('add', '-A');
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'old plan');
  return {
    root,
    plan,
    layout: { root, plan },
    git,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('an uncommitted new plan is the one the diff is graded against', async () => {
  const r = repo();
  try {
    writeFileSync(path.join(r.plan, 'new.md'), '# Plan: new\n- **Status:** approved\n\n## Files\n```\nsrc/new.py\n```\n');
    writeFileSync(path.join(r.root, 'src/new.py'), 'new\n');
    const out = await run({ layout: r.layout });
    assert.equal(out.verdict, 'pass', JSON.stringify(out.findings));
  } finally { r.cleanup(); }
});

test('untracked files not named in the working-tree plan are drift', async () => {
  const r = repo();
  try {
    writeFileSync(path.join(r.plan, 'new.md'), '# Plan: new\n- **Status:** approved\n\n## Files\n```\nsrc/new.py\n```\n');
    writeFileSync(path.join(r.root, 'src/new.py'), 'new\n');
    writeFileSync(path.join(r.root, 'src/other.py'), 'nope\n');
    const out = await run({ layout: r.layout });
    assert.equal(out.verdict, 'fail');
    assert.match(out.findings.map((f) => f.file).join(' '), /src\/other\.py/);
    assert.match(out.findings[0].message, /new\.md/);
  } finally { r.cleanup(); }
});

test('with no dirty plan, the newest committed plan still applies', async () => {
  const r = repo();
  try {
    writeFileSync(path.join(r.root, 'src/stray.py'), 'x\n');
    r.git('add', 'src/stray.py');
    const out = await run({ layout: r.layout });
    assert.equal(out.verdict, 'fail');
    assert.match(out.findings[0].message, /old\.md/);
  } finally { r.cleanup(); }
});
