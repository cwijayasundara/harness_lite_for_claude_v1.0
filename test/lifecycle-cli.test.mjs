import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { A, C, BIN } from './_paths.mjs';
import { sealContract } from '../.aidlc/lib/contract.mjs';

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
      const result = run(root, 'new', 'intent', slug);
      assert.equal(result.status, 2, slug);
      assert.match(result.stderr, /slug must be/);
    }
    assert.equal(existsSync(path.join(root, 'escape.md')), false);
    assert.equal(run(root, 'new', 'intent', 'safe-change').status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('status fails when intent acceptance has not entered git history', () => {
  const root = repo();
  try {
    // A spec approval standing on an intent acceptance that never entered git history.
    // validateContract checks the ref *says* accepted; only history says anyone can see it.
    assert.equal(run(root, 'contract', 'new', 'uncommitted-gate').status, 0);
    const ref = path.join(root, '.aidlc/artifacts/intent-refs/uncommitted-gate.json');
    const value = JSON.parse(readFileSync(ref, 'utf8'));
    value.decision = { status: 'accepted', decided_by: 'test', decided_at: '2026-08-24T00:00:00.000Z' };
    value.snapshot_digest = `sha256:${'a'.repeat(64)}`;
    value.source = { ...value.source, revision: 'deadbeef' };
    writeFileSync(ref, JSON.stringify(value, null, 2) + '\n');
    const contract = path.join(root, '.aidlc/artifacts/contracts/uncommitted-gate.md');
    sealContract(contract, 'spec');
    const result = run(root, 'status', 'uncommitted-gate');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /acceptance is not committed/);
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

test('status reports playbook indicators from git history and eval results', () => {
  const root = repo();
  try {
    // Intent survival now reads the contract chain: the intent ref's committed decision, not a
    // Status line in a legacy intent file. An acceptance that was never committed is not a gate.
    const commit = (m) => {
      spawnSync('git', ['add', '.'], { cwd: root });
      spawnSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', m], { cwd: root });
    };
    for (const slug of ['kept-change', 'dropped-change']) {
      assert.equal(run(root, 'contract', 'new', slug).status, 0);
    }
    // dropped-change is an intent closed before any contract was written, which is what a
    // dropped intent actually looks like: a ref, and nothing built from it.
    rmSync(path.join(root, '.aidlc/artifacts/contracts/dropped-change.md'));
    commit('one contract, two intents');

    const refOf = (slug) => path.join(root, `.aidlc/artifacts/intent-refs/${slug}.json`);
    const decide = (slug, status) => {
      const ref = JSON.parse(readFileSync(refOf(slug), 'utf8'));
      ref.decision = { status, decided_by: 'test', decided_at: '2026-08-24T00:00:00.000Z' };
      // A decided intent must pin what was decided: an immutable snapshot digest and a
      // reproducible source revision. validateIntentRef enforces both.
      ref.snapshot_digest = `sha256:${'a'.repeat(64)}`;
      ref.source = { ...ref.source, revision: 'deadbeef' };
      writeFileSync(refOf(slug), JSON.stringify(ref, null, 2) + '\n');
    };
    decide('kept-change', 'accepted');
    decide('dropped-change', 'closed');
    commit('decide intents');

    const kept = path.join(root, '.aidlc/artifacts/contracts/kept-change.md');
    sealContract(kept, 'spec'); commit('spec seal: kept-change');
    sealContract(kept, 'plan'); commit('plan seal: kept-change');

    mkdirSync(path.join(root, '.aidlc/evals/results'), { recursive: true });
    writeFileSync(path.join(root, '.aidlc/evals/results/2026-08-24T04-01-22-046Z.json'), JSON.stringify({ summary: { total: 20, pass: 14 } }));
    writeFileSync(path.join(root, '.aidlc/evals/results/2026-08-24T04-41-43-578Z.json'), JSON.stringify({ summary: { total: 1, pass: 1 } }));

    const result = run(root, 'status', '--json');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.playbook.intent_survival.approved, 1);
    assert.equal(body.playbook.intent_survival.closed, 1);
    assert.equal(body.playbook.intent_survival.rate, 0.5);
    assert.equal(body.playbook.eval_pass_rate.pass, 14);
    assert.equal(body.playbook.eval_pass_rate.total, 20);
    assert.equal(body.playbook.eval_pass_rate.rate, 0.7);
    const text = run(root, 'status');
    assert.match(text.stdout, /playbook/);
    assert.match(text.stdout, /intent survival/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
