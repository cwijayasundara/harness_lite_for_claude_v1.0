import { traceFixture } from './_trace-fixture.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { FIXTURES, stage } from '../evals/lib/stage.mjs';
import * as artifacts from '../.aidlc/lib/artifacts.mjs';
import { writeBlocked, bashContractBlocked } from '../.aidlc/lib/guard.mjs';
import { run } from '../.aidlc/checks/scope-drift.mjs';
import { BIN } from './_paths.mjs';
const cfg = root => ({ layout: { root, artifacts: path.join(root, '.aidlc/artifacts'), state: path.join(root, '.aidlc/state') }, guard: { require_contract: true } });
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = root => { git(root, 'add', '-A'); git(root, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'test artifacts'); };
const cli = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });
function second(root) {
  const d = path.join(root, '.aidlc/artifacts/second'); mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, 'intent.md'), '---\nstatus: draft\n---\n# Second product change\n');
  for (const kind of ['spec', 'plan']) {
    const body = kind === 'spec' ? '# Spec\n\n### B1\nHandle requests.\n' : '# Plan\n\n## Files\n- `src/app/handlers.py`\n';
    writeFileSync(path.join(d, `${kind}.md`), artifacts.render({ status: 'approved', by: 'simulated-test', at: '2099-01-01', digest: artifacts.bodyDigest(body) }, body));
  }
  commit(root);
}

test('product backlog regression and two real worktrees retain independent scope', async () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    second(s.work);
    assert.equal(artifacts.currentChange(cfg(s.work)).slug, 'hyphen-titlecase', 'a later committed approval cannot steal the prior selection');
    const other = path.join(s.root, 'engineer-b');
    git(s.work, 'worktree', 'add', '-b', 'engineer-b', other);
    assert.equal(artifacts.currentChange(cfg(other)), null, 'new worktree must not inherit selection');
    assert.equal(cli(s.work, 'status', '--change', 'hyphen-titlecase').status, 0);
    assert.equal(cli(other, 'status', '--change', 'second').status, 0);
    for (const [root, slug, owned, unowned] of [[s.work, 'hyphen-titlecase', 'text', 'handlers'], [other, 'second', 'handlers', 'text']]) {
      const c = cfg(root);
      assert.equal(artifacts.currentChange(c).slug, slug);
      assert.equal(writeBlocked(`src/app/${owned}.py`, c), null);
      assert.match(writeBlocked(`src/app/${unowned}.py`, c), new RegExp(slug));
      const d = path.join(c.layout.artifacts, 'future-report'); mkdirSync(d);
      writeFileSync(path.join(d, 'intent.md'), '# Customers need a monthly report\n');
      writeFileSync(path.join(root, `src/app/${owned}.py`), '# permitted product edit\n');
      assert.equal((await run(c)).verdict, 'pass', 'unrelated intent must not stop product work');
      writeFileSync(path.join(d, 'spec.md'), '# Spec\n### B1\nProduce reports.\n');
      assert.equal((await run(c)).verdict, 'pass');
      const foreign = path.join(c.layout.artifacts, slug === 'second' ? 'hyphen-titlecase' : 'second', 'spec.md');
      writeFileSync(foreign, readFileSync(foreign, 'utf8') + '\nstale unrelated approval\n');
      assert.equal((await run(c)).verdict, 'pass');
      assert.equal(JSON.parse(cli(root, 'status', '--json').stdout).current.slug, slug);
      const hook = spawnSync(process.execPath, [BIN, 'hook', 'session-start'], { cwd: root, encoding: 'utf8', input: JSON.stringify({ cwd: root }) });
      assert.match(hook.stdout, new RegExp(`current: ${slug}`));
    }
  } finally { s.cleanup(); }
});

test('selection survives restart, rejects branch changes, detached movement and invalid targets', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const c = cfg(s.work); const branch = git(s.work, 'symbolic-ref', 'HEAD');
    assert.equal(cli(s.work, 'status', '--change', 'hyphen-titlecase').status, 0);
    assert.match(cli(s.work, 'status').stdout, /current: hyphen-titlecase \(plan approved\)/);
    git(s.work, 'checkout', '-b', 'different');
    assert.equal(artifacts.currentChange(c), null);
    assert.match(writeBlocked('src/app/text.py', c), /branch|reselect/);
    assert.equal(writeBlocked('.aidlc/artifacts/new/spec.md', c), null);
    assert.equal(bashContractBlocked('cat src/app/text.py', c), null);
    git(s.work, 'checkout', branch.replace('refs/heads/', ''));
    assert.ok(artifacts.currentChange(c).plan);
    git(s.work, 'checkout', '--detach');
    assert.equal(artifacts.currentChange(c), null);
    artifacts.selectChange(c, 'hyphen-titlecase');
    assert.ok(artifacts.currentChange(c).plan);
    git(s.work, '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'detached movement');
    assert.equal(artifacts.currentChange(c), null);
    artifacts.selectChange(c, 'hyphen-titlecase');
    const binding = path.join(git(s.work, 'rev-parse', '--absolute-git-dir'), 'aidlc-change.json');
    const good = readFileSync(binding, 'utf8');
    for (const invalid of ['{', '{}', JSON.stringify({ ...JSON.parse(good), slug: '../escape' }), JSON.stringify({ ...JSON.parse(good), slug: 'missing' })]) {
      writeFileSync(binding, invalid);
      assert.equal(artifacts.currentChange(c), null);
      assert.match(writeBlocked('src/app/text.py', c), /harness status --change/);
    }
    writeFileSync(binding, good);
    const intent = path.join(c.layout.artifacts, 'hyphen-titlecase/intent.md');
    writeFileSync(intent, '---\nstatus: closed\n---\n');
    assert.equal(artifacts.currentChange(c), null);
    assert.notEqual(cli(s.work, 'status', '--change', 'hyphen-titlecase').status, 0);
    assert.notEqual(cli(s.work, 'status', '--change', '../escape').status, 0);
    assert.equal(cli(s.work, 'status', '--clear-change').status, 0);
    assert.equal(artifacts.currentChange(c), null);
    assert.match(cli(s.work, 'status').stdout, /no selection/);
  } finally { s.cleanup(); }
});

for (const kind of ['spec', 'plan']) for (const state of ['absent', 'draft', 'uncommitted', 'stale']) {
  test(`selected ${kind} ${state} cannot borrow scope`, async () => {
    const s = stage(FIXTURES, 'contract-planned');
    try {
      second(s.work); const c = cfg(s.work); artifacts.selectChange(c, 'hyphen-titlecase');
      const target = path.join(c.layout.artifacts, `hyphen-titlecase/${kind}.md`);
      const original = readFileSync(target, 'utf8');
      if (state === 'absent') rmSync(target);
      if (state === 'draft') writeFileSync(target, original.replace('status: approved', 'status: draft'));
      if (state === 'uncommitted') writeFileSync(target, original.replace('by: fixture', 'by: another-test-reviewer'));
      if (state === 'stale') writeFileSync(target, original + '\nnew unapproved scope\n');
      assert.equal(artifacts.currentChange(c).slug, 'hyphen-titlecase');
      assert.deepEqual(artifacts.governingPlans(c), []);
      for (const file of ['src/app/text.py', 'src/app/handlers.py']) assert.match(writeBlocked(file, c), /hyphen-titlecase/);
      writeFileSync(path.join(s.work, 'src/app/text.py'), '# own gate not ready\n');
      assert.equal((await run(c)).verdict, 'fail');
      writeFileSync(target, original);
      assert.equal(writeBlocked('src/app/text.py', c), null);
    } finally { s.cleanup(); }
  });
}

test('absence never infers authority and invalid CLI selection preserves the binding', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const c = cfg(s.work);
    artifacts.clearSelection(c);
    assert.equal(artifacts.currentChange(c), null, 'even a single approved change requires selection');
    second(s.work);
    assert.deepEqual(artifacts.governingPlans(c), [], 'approval cannot select from multiple changes');
    assert.match(writeBlocked('src/app/text.py', c), /no selection/);
    assert.equal(cli(s.work, 'status', '--change', 'hyphen-titlecase').status, 0);
    const binding = path.join(git(s.work, 'rev-parse', '--absolute-git-dir'), 'aidlc-change.json');
    const before = readFileSync(binding, 'utf8');
    for (const args of [['--change'], ['--change', 'missing'], ['--change', 'second', '--clear-change']]) {
      assert.notEqual(cli(s.work, 'status', ...args).status, 0);
      assert.equal(readFileSync(binding, 'utf8'), before);
    }
    const spec = path.join(c.layout.artifacts, 'hyphen-titlecase/spec.md');
    rmSync(spec); mkdirSync(spec);
    assert.deepEqual(artifacts.governingPlans(c), []);
    assert.match(writeBlocked('src/app/text.py', c), /hyphen-titlecase.*unreadable|readable artifacts for hyphen-titlecase/);
    assert.equal(writeBlocked('.aidlc/artifacts/second/spec.md', c), null);
  } finally { s.cleanup(); }
});


test('existing product driver selects sequential proposals without approving them', async () => {
  const { prepareProductChange } = await import('../evals/lib/campaign.mjs');
  const s = stage(FIXTURES, 'campaign-ledger');
  try {
    const c = cfg(s.work);
    for (const slug of ['first-delivery', 'second-delivery']) {
      prepareProductChange(s, { slug, request: 'Improve invoice listing', behaviours: ['Given invoices, when listed, then preserve totals.'], files: ['src/ledger.mjs'] });
      assert.equal(artifacts.currentChange(c).slug, slug);
      assert.deepEqual(artifacts.governingPlans(c), []);
      assert.equal(artifacts.read(c, slug, 'spec').front.status, 'draft');
      assert.match(writeBlocked('src/ledger.mjs', c), new RegExp(slug));
      traceFixture(s.work);
      commit(s.work);
      for (const kind of ['spec', 'plan']) {
        artifacts.approve(c, slug, kind, { by: 'simulated-test-driver' });
        assert.deepEqual(artifacts.governingPlans(c), [], 'approval must be committed');
        commit(s.work);
      }
      assert.equal(writeBlocked('src/ledger.mjs', c), null);
      writeFileSync(path.join(c.layout.artifacts, slug, 'intent.md'), '---\nstatus: closed\n---\nDelivered in simulation.\n');
      commit(s.work);
      assert.equal(artifacts.currentChange(c), null, 'closing does not choose another change');
    }
  } finally { s.cleanup(); }
});
