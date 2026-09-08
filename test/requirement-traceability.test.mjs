import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeBlocked } from '../.aidlc/lib/guard.mjs';
import { stage, FIXTURES } from '../evals/lib/stage.mjs';
import { loadConfig } from '../.aidlc/lib/config.mjs';
import * as a from '../.aidlc/lib/artifacts.mjs';

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = root => { git(root, 'add', '-A'); git(root, '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'Simulated trace test'); };
const slug = 'hyphen-titlecase';
test('canonical approval digest ignores metadata order and audit labels, but binds semantic fields', () => {
  const body = '# Design\n';
  const one = a.render({ status: 'approved', by: 'one', source_revision: 'v1', source: 'https://example.invalid/1', approval_version: '2' }, body);
  const two = a.render({ approval_version: '2', source: 'https://example.invalid/1', source_revision: 'v1', by: 'two', status: 'draft' }, body);
  assert.equal(a.approvalDigest(one), a.approvalDigest(two));
  assert.notEqual(a.approvalDigest(one), a.approvalDigest(two.replace('source_revision: v1', 'source_revision: v2')));
});
function edit(cfg, kind, fn) {
  const target = a.file(cfg, slug, kind);
  writeFileSync(target, fn(readFileSync(target, 'utf8')));
}
function prepare(cfg) {
  edit(cfg, 'intent', text => {
    const { front, body } = a.parse(text);
    return a.render({ ...front, source: 'src/app/text.py', source_revision: git(cfg.layout.root, 'rev-parse', 'HEAD') }, body);
  });
  edit(cfg, 'spec', text => text + '\n## Requirements\n\n| Source criterion | Behaviour IDs |\n|---|---|\n| local:hyphens | B1 |\n| local:spaces | B2 |\n');
  commit(cfg.layout.root);
}
function approve(cfg) {
  for (const kind of ['spec', 'plan']) {
    a.approve(cfg, slug, kind, { by: 'simulated-test-driver' });
    commit(cfg.layout.root);
  }
}

test('product: new approval binds intent, semantic metadata and dependent plan', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const cfg = loadConfig(s.work);
    prepare(cfg); approve(cfg);
    assert.equal(a.read(cfg, slug, 'spec').front.approval_version, '2');
    const intent = a.read(cfg, slug, 'intent').text;
    edit(cfg, 'intent', text => text + '\nCorrected product requirement\n');
    assert.equal(a.read(cfg, slug, 'spec').state, 'stale-approval');
    assert.equal(a.read(cfg, slug, 'plan').state, 'stale-approval');
    assert.equal(a.currentChange(cfg).plan, null);
    writeFileSync(a.file(cfg, slug, 'intent'), intent);
    const spec = a.read(cfg, slug, 'spec').text;
    edit(cfg, 'spec', text => text.replace('status: approved', 'status: approved\nsupersedes: missing#B99'));
    assert.equal(a.read(cfg, slug, 'spec').state, 'stale-approval');
    writeFileSync(a.file(cfg, slug, 'spec'), spec);
    commit(s.work);
    assert.equal(a.read(cfg, slug, 'spec').state, 'approved', 'unrelated commit preserves binding');
    edit(cfg, 'spec', text => text.replace(/^approval_version:.*\n/gm, '').replace(/^approval_digest:.*\n/gm, ''));
    commit(s.work);
    assert.equal(a.read(cfg, slug, 'spec').state, 'stale-approval', 'committed downgrade must not recover legacy authority');
  } finally { s.cleanup(); }
});

test('legacy approval stays readable but new approval cannot omit trace inputs or bypass them', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const cfg = loadConfig(s.work);
    assert.equal(a.read(cfg, slug, 'spec').binding, 'legacy/unbound');
    assert.throws(() => a.approve(cfg, slug, 'spec', { by: 'simulation', anyway: 'test' }), /source/);
    prepare(cfg);
    edit(cfg, 'spec', text => text.replace('| local:spaces | B2 |', '| local:spaces | B99 |'));
    commit(s.work);
    assert.throws(() => a.approve(cfg, slug, 'spec', { by: 'simulation', anyway: 'test' }), /Requirements/);
  } finally { s.cleanup(); }
});

test('new bindings reject malformed metadata, unknown versions, unsafe sources and ambiguous requirements', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const cfg = loadConfig(s.work); prepare(cfg);
    const intent = a.read(cfg, slug, 'intent').text, spec = a.read(cfg, slug, 'spec').text;
    for (const source of ['../outside.md', '/tmp/outside.md', 'src/../app/text.py', 'missing.md']) {
      edit(cfg, 'intent', () => intent.replace(/^source:.*$/m, `source: ${source}`));
      commit(s.work);
      assert.throws(() => a.approve(cfg, slug, 'spec', { by: 'simulation', anyway: 'test' }), /source/);
    }
    writeFileSync(a.file(cfg, slug, 'intent'), intent);
    for (const suffix of ['source: repeated\nsource: duplicate', 'nested:\n  value: wrong', 'nested: [one, two]']) {
      edit(cfg, 'spec', () => spec.replace('status: approved', `status: approved\n${suffix}`));
      commit(s.work);
      assert.throws(() => a.approve(cfg, slug, 'spec', { by: 'simulation', anyway: 'test' }), /scalar/);
    }
    for (const replace of ['| local:hyphens | B1 |', '| local:spaces | B1, B1 |', '| local:spaces | B99 |']) {
      edit(cfg, 'spec', () => spec.replace('| local:spaces | B2 |', replace));
      commit(s.work);
      assert.throws(() => a.approve(cfg, slug, 'spec', { by: 'simulation', anyway: 'test' }), /Requirements/);
    }
    writeFileSync(a.file(cfg, slug, 'spec'), spec); commit(s.work); approve(cfg);
    const bound = a.read(cfg, slug, 'spec').text;
    for (const editText of [
      text => text.replace('approval_version: 2', 'approval_version: 99'),
      text => text.replace('approval_version: 2', 'approval_version: 1'),
      text => text.replace(/^approval_digest:.*\n/m, ''),
      text => text.replace('status: approved', 'status: approved\nextra_semantics: changed'),
    ]) {
      edit(cfg, 'spec', () => editText(bound));
      assert.equal(a.read(cfg, slug, 'spec').state, 'stale-approval');
      assert.match(writeBlocked('src/app/text.py', cfg), /re-approve|edited after|stale/);
      assert.equal(a.read(cfg, slug, 'plan').state, 'stale-approval');
    }
  } finally { s.cleanup(); }
});

test('exact source/intent snapshots survive a harmless rebase and lifecycle closure preserves history', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const cfg = loadConfig(s.work), original = git(s.work, 'rev-parse', 'HEAD');
    git(s.work, 'checkout', '-b', 'trace-change');
    a.selectChange(cfg, slug); prepare(cfg); approve(cfg);
    const approved = a.read(cfg, slug, 'spec');
    assert.equal(approved.front.source_revision, original);
    assert.equal(approved.front.source_kind, 'repository');
    assert.match(approved.front.intent_digest, /^sha256:/);
    git(s.work, 'checkout', '-b', 'target-update', original);
    writeFileSync(s.work + '/unrelated.txt', 'Independent product work\n'); commit(s.work);
    git(s.work, 'checkout', 'trace-change'); git(s.work, 'rebase', 'target-update');
    assert.equal(a.read(cfg, slug, 'spec').state, 'approved');
    assert.equal(a.read(cfg, slug, 'plan').state, 'approved');
    assert.equal(a.read(cfg, slug, 'spec').front.approval_digest, approved.front.approval_digest);
    edit(cfg, 'intent', text => text.replace(/^status:.*$/m, 'status: closed'));
    commit(s.work);
    assert.equal(a.read(cfg, slug, 'spec').state, 'approved', 'closure is not a requirement correction');
    assert.equal(a.currentChange(cfg), null, 'closed change still grants no execution scope');
  } finally { s.cleanup(); }
});

test('uncommitted intent and symlink sources cannot authorize a new approval', () => {
  const s = stage(FIXTURES, 'contract-planned');
  try {
    const cfg = loadConfig(s.work); prepare(cfg);
    const intent = a.read(cfg, slug, 'intent').text;
    edit(cfg, 'intent', text => text + '\nUncommitted correction\n');
    assert.throws(() => a.approve(cfg, slug, 'spec', { by: 'simulation', anyway: 'test' }), /commit intent/);
    writeFileSync(a.file(cfg, slug, 'intent'), intent);
    symlinkSync('src/app/text.py', path.join(s.work, 'source-link')); commit(s.work);
    edit(cfg, 'intent', text => text.replace(/^source:.*$/m, 'source: source-link').replace(/^source_revision:.*$/m, `source_revision: ${git(s.work, 'rev-parse', 'HEAD')}`));
    commit(s.work);
    assert.throws(() => a.approve(cfg, slug, 'spec', { by: 'simulation', anyway: 'test' }), /regular committed file/);
  } finally { s.cleanup(); }
});

test('shallow legacy history cannot hide a previously recorded binding', () => {
  const s = stage(FIXTURES, 'contract-planned'), shallow = mkdtempSync(path.join(tmpdir(), 'trace-shallow-'));
  try {
    const cfg = loadConfig(s.work); prepare(cfg); approve(cfg);
    edit(cfg, 'spec', text => text.replace(/^approval_version:.*\n/m, '').replace(/^approval_digest:.*\n/m, ''));
    commit(s.work);
    git(s.work, 'clone', '--depth', '1', `file://${s.work}`, shallow);
    const artifact = a.read(loadConfig(shallow), slug, 'spec');
    assert.equal(artifact.state, 'stale-approval');
    assert.match(artifact.bindingError, /shallow/);
    git(shallow, 'fetch', '--unshallow');
    assert.equal(a.read(loadConfig(shallow), slug, 'spec').state, 'stale-approval');
  } finally { s.cleanup(); rmSync(shallow, { recursive: true, force: true }); }
});
