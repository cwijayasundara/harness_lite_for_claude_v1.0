import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { A, C, BIN } from './_paths.mjs';

const run = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-cli-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 'harness@example.invalid'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Harness Test'], { cwd: root });
  assert.equal(run(root, 'init', '--into', root).status, 0);
  return root;
}

test('new rejects path traversal and non-canonical artifact slugs', () => {
  const root = repo();
  try {
    for (const slug of ['../escape', '/absolute', 'Uppercase', 'two words', 'a'.repeat(64)]) {
      const result = run(root, 'new', slug);
      assert.equal(result.status, 2, slug);
      assert.match(result.stderr, /slug must be/);
    }
    assert.equal(existsSync(path.join(root, 'escape.md')), false);
    assert.equal(run(root, 'new', 'safe-change').status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// lean-v2 B4. One approval verb, and the two rules that make an approval mean something: it is
// recorded against a body that is in git history, and the gates are ordered.
//
// The contract chain spent four commands and four commits on this — accept, seal --scope spec,
// seal --scope plan, evidence — with a commit forced between each. The gates are the same; the
// ceremony is not.
test('approve refuses an uncommitted artifact, and refuses a plan before its spec', () => {
  const root = repo();
  const commit = (m) => {
    spawnSync('git', ['add', '-A'], { cwd: root });
    spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', m], { cwd: root });
  };
  try {
    assert.equal(run(root, 'new', 'gate-order').status, 0);
    for (const kind of ['intent', 'spec', 'plan', 'review']) {
      assert.ok(existsSync(path.join(root, '.aidlc/artifacts/gate-order', `${kind}.md`)), `${kind}.md not created`);
    }

    // Uncommitted: an approval of a working copy is an approval of something no reviewer can read.
    const early = run(root, 'approve', 'gate-order', 'spec', '--by', 'tester');
    assert.equal(early.status, 1);
    assert.match(early.stderr, /commit .*spec\.md before approving/);

    commit('draft gate-order');

    // Ordered: a plan approved before its spec is a plan approved against nothing.
    const outOfOrder = run(root, 'approve', 'gate-order', 'plan', '--by', 'tester');
    assert.equal(outOfOrder.status, 1);
    assert.match(outOfOrder.stderr, /approve the spec before the plan/);

    // Only the two gates are approvable.
    assert.equal(run(root, 'approve', 'gate-order', 'intent', '--by', 'tester').status, 2);

    assert.equal(run(root, 'approve', 'gate-order', 'spec', '--by', 'tester').status, 0);
    commit('spec approved');
    assert.equal(run(root, 'approve', 'gate-order', 'plan', '--by', 'tester').status, 0);
    commit('plan approved');

    const front = readFileSync(path.join(root, '.aidlc/artifacts/gate-order/plan.md'), 'utf8');
    assert.match(front, /^status: approved$/m);
    assert.match(front, /^by: tester$/m);
    assert.match(front, /^digest: sha256:[a-f0-9]{64}$/m);

    assert.match(run(root, 'status', 'gate-order').stdout, /approved\s+approved/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// The third state. An approved artifact whose body has since changed is not a draft and is not
// approved, and saying so out loud is the point — the alternative is a gate that quietly still
// reads as passed while the text under it moved.
test('editing an approved artifact reports a stale approval', () => {
  const root = repo();
  const commit = (m) => {
    spawnSync('git', ['add', '-A'], { cwd: root });
    spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', m], { cwd: root });
  };
  try {
    assert.equal(run(root, 'new', 'drifted').status, 0);
    commit('draft drifted');
    assert.equal(run(root, 'approve', 'drifted', 'spec', '--by', 'tester').status, 0);
    commit('spec approved');

    const spec = path.join(root, '.aidlc/artifacts/drifted/spec.md');
    writeFileSync(spec, readFileSync(spec, 'utf8') + '\nAdded after approval.\n');

    const result = run(root, 'status', 'drifted');
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /stale-approval/);
    assert.match(result.stdout, /changed after it was approved/);

    // And a plan cannot be approved on top of a spec that moved.
    const blocked = run(root, 'approve', 'drifted', 'plan', '--by', 'tester');
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /re-approve it first/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('init is idempotent and installs a checkout-independent shim', () => {
  const root = repo();
  try {
    const config = path.join(root, '.aidlc/harness.toml');
    writeFileSync(config, readFileSync(config, 'utf8').replace('CHANGE-ME', 'preserved-name'));
    assert.equal(run(root, 'init', '--into', root).status, 0);
    assert.match(readFileSync(config, 'utf8'), /preserved-name/);
    const shim = path.join(root, '.aidlc/bin/harness');
    chmodSync(shim, 0o755);
    const text = readFileSync(shim, 'utf8');
    assert.doesNotMatch(text, new RegExp(C.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    // The harness is declared, never copied: a project that carries its own runtime can drift
    // from the version the pod agreed on. The record is what names the version instead.
    assert.equal(existsSync(path.join(root, '.claude/runtime')), false);
    assert.ok(existsSync(path.join(root, '.aidlc/harness-install.json')));
    // HARNESS_HOME is how CI points the shim at the checkout it made from the recorded commit.
    const doctor = spawnSync(shim, ['doctor'], { cwd: root, encoding: 'utf8', env: { ...process.env, HARNESS_HOME: A } });
    assert.equal(doctor.status, 0);
    assert.match(doctor.stdout, /preserved-name/);
    assert.match(doctor.stdout, /secrets\s+\[built-in\]/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// init-does-not-invalidate-the-prefix B2-B5. `init` writes through Node, so no guard sees it.
// A model used that on 2026-09-02 to route around the prompt-prefix guard: edit the canonical
// instructions, re-run init, and CLAUDE.md changes with nothing said.
test('init refuses to rewrite a cached-prefix file it would change, unless forced', () => {
  const root = repo();
  try {
    const claudeMd = path.join(root, '.claude/CLAUDE.md');
    const instructions = path.join(root, '.aidlc/instructions.md');
    const before = readFileSync(claudeMd, 'utf8');

    // B2: an install that is already current writes nothing and is not refused.
    assert.equal(run(root, 'init', '--into', root).status, 0);
    assert.equal(readFileSync(claudeMd, 'utf8'), before);

    // B3: the route the model took. Refused, named, and nothing written.
    writeFileSync(instructions, `${readFileSync(instructions, 'utf8')}\nRun the linter before saying done.\n`);
    const refused = run(root, 'init', '--into', root);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /cached prompt prefix/);
    assert.match(refused.stderr, /\.claude\/CLAUDE\.md/);
    assert.equal(readFileSync(claudeMd, 'utf8'), before, 'a refused init leaves the tree untouched');

    // B4: deliberate stays possible. The control makes it visible, not impossible.
    assert.equal(run(root, 'init', '--into', root, '--force').status, 0);
    assert.match(readFileSync(claudeMd, 'utf8'), /Run the linter before saying done/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

