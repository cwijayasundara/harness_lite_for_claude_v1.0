// G18. A deploy to a live environment is authorised by a record, not by an environment variable.
//
// `HARNESS_RELEASE_APPROVAL` was any non-empty value of a variable. It said nothing about who
// approved, what they approved, or when it stopped being true, and one line in a shell profile
// disabled the control permanently and silently. A record names a candidate commit, a person and
// an expiry — so an authorisation for one revision cannot be spent on another, which is the
// failure the variable could not even describe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import { Readable } from 'node:stream';
import * as release from '../.aidlc/lib/release.mjs';
import { productionDenied, releaseDecision } from '../.aidlc/lib/guard.mjs';
import { loadConfig } from '../.aidlc/lib/config.mjs';
import { read as readLedger } from '../.aidlc/lib/ledger.mjs';
import { BIN } from './_paths.mjs';

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'release-'));
  const git = (...a) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...a], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'release@example.invalid');
  git('config', 'user.name', 'Release Test');
  writeFileSync(path.join(root, 'app.txt'), 'v1\n');
  git('add', '-A');
  git('commit', '-qm', 'v1');
  assert.equal(spawnSync(process.execPath, [BIN, 'init', '--into', root], { cwd: root, encoding: 'utf8' }).status, 0);
  return { root, git, cfg: () => loadConfig(root), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const cli = (root, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' });

// The pre-tool hook, in process, with stdin and stdout borrowed. Running the hook is the only way
// to assert what it does; reading the regex that implements it asserts only that a regex exists.
async function bashHook(root, command) {
  const { dispatch } = await import('../.aidlc/hooks/dispatch.mjs');
  const stdin = Readable.from([JSON.stringify({ cwd: root, tool_name: 'Bash', tool_input: { command } })]);
  const original = Object.getOwnPropertyDescriptor(process, 'stdin');
  const write = process.stdout.write.bind(process.stdout);
  const chunks = [];
  process.stdout.write = (c) => { chunks.push(String(c)); return true; };
  Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
  try { await dispatch('pre-tool'); } finally {
    process.stdout.write = write;
    Object.defineProperty(process, 'stdin', original);
  }
  return chunks.join('');
}

test('a release is denied without a record, allowed with one, and denied again once it expires', () => {
  const r = repo();
  try {
    const cfg = r.cfg();
    const deploy = 'deploy --env production';

    // No record. The denial says what is missing and how to fix it — a denial with no route is a
    // denial people route around.
    const before = releaseDecision(deploy, cfg);
    assert.equal(before.allowed, false);
    assert.equal(before.reason, 'no release record');
    assert.match(before.route, /harness release approve --by/);
    assert.match(productionDenied(deploy, cfg), /needs a current release record/);

    // Approved: this commit, by this person, until this time.
    const record = release.approve(cfg, { by: 'the release manager', minutes: 30 });
    assert.equal(record.candidate, r.git('rev-parse', 'HEAD'));
    assert.equal(record.approved_by, 'the release manager');
    const allowed = releaseDecision(deploy, cfg);
    assert.equal(allowed.allowed, true);
    assert.match(allowed.reason, /approved by the release manager/);
    assert.equal(productionDenied(deploy, cfg), null);

    // Expiry is a time, and it passes. An authorisation with no end is a permission.
    const afterExpiry = releaseDecision(deploy, cfg, { now: Date.parse(record.expires) + 1 });
    assert.equal(afterExpiry.allowed, false);
    assert.match(afterExpiry.reason, /expired at/);
    assert.match(productionDenied(deploy, cfg, { now: Date.parse(record.expires) + 1 }), /expired at/);

    // And it authorises THAT commit. A green review of one revision cannot be spent on another.
    writeFileSync(path.join(r.root, 'app.txt'), 'v2\n');
    r.git('add', '-A');
    r.git('commit', '-qm', 'v2');
    const moved = releaseDecision(deploy, cfg);
    assert.equal(moved.allowed, false);
    assert.match(moved.reason, /authorises .* and HEAD is/);

    // Revoking ends it early.
    release.approve(cfg, { by: 'the release manager' });
    assert.equal(releaseDecision(deploy, cfg).allowed, true);
    assert.deepEqual(release.revoke(cfg), { revoked: true });
    assert.equal(releaseDecision(deploy, cfg).allowed, false);
    assert.deepEqual(release.revoke(cfg), { revoked: false });
  } finally { r.cleanup(); }
});

test('a record that is not a record does not authorise anything', () => {
  const r = repo();
  try {
    const cfg = r.cfg();
    const target = release.file(cfg);
    for (const [content, expected] of [
      ['not json at all', /not readable JSON/],
      [JSON.stringify({ approved_by: 'x', expires: new Date(Date.now() + 60000).toISOString() }), /names no candidate/],
      [JSON.stringify({ candidate: 'a'.repeat(40), expires: new Date(Date.now() + 60000).toISOString() }), /names no candidate, approver or expiry/],
      [JSON.stringify({ candidate: 'a'.repeat(40), approved_by: 'x', expires: 'whenever' }), /unreadable expiry/],
    ]) {
      writeFileSync(target, content);
      const decision = release.state(cfg);
      assert.equal(decision.allowed, false, content.slice(0, 40));
      assert.match(decision.reason, expected);
      assert.match(decision.route, /harness release approve/);
    }
  } finally { r.cleanup(); }
});

test('an approval needs an approver and a positive window, and authorises a commit rather than a tree', () => {
  const r = repo();
  try {
    const cfg = r.cfg();
    assert.throws(() => release.approve(cfg, {}), /needs an approver/);
    assert.throws(() => release.approve(cfg, { by: 'a\nb' }), /needs an approver/);
    assert.throws(() => release.approve(cfg, { by: 'x', minutes: 0 }), /positive/);
    assert.throws(() => release.approve(cfg, { by: 'x', minutes: 'soon' }), /positive/);

    const bare = mkdtempSync(path.join(tmpdir(), 'release-nogit-'));
    try {
      assert.throws(() => release.approve({ layout: { root: bare, state: path.join(bare, '.aidlc/state') } }, { by: 'x' }),
        /authorises a commit, not a working tree/);
    } finally { rmSync(bare, { recursive: true, force: true }); }
  } finally { r.cleanup(); }
});

test('both outcomes reach the ledger, with the candidate, the reason and the route', async () => {
  const r = repo();
  try {
    const bash = (command) => bashHook(r.root, command);
    const rows = () => readLedger(r.cfg().layout).filter((row) => row.control === 'release-authorization');

    const denied = await bash('deploy --env production');
    assert.match(denied, /needs a current release record/);
    const deniedRow = rows().at(-1);
    assert.equal(deniedRow.verdict, 'fail');
    assert.equal(deniedRow.reason, 'no release record');
    assert.match(deniedRow.route, /harness release approve --by/);
    assert.equal(deniedRow.candidate, r.git('rev-parse', 'HEAD'));

    release.approve(r.cfg(), { by: 'the release manager' });
    const allowed = await bash('deploy --env production');
    assert.doesNotMatch(allowed, /needs a current release record/);
    const allowedRow = rows().at(-1);
    // An allow that leaves no trace is indistinguishable from a control that never ran, and
    // "who deployed what, under whose authorisation" is what an incident asks first.
    assert.equal(allowedRow.verdict, 'pass');
    assert.equal(allowedRow.approved_by, 'the release manager');
    assert.match(allowedRow.reason, /approved by the release manager/);
    assert.equal(allowedRow.route, undefined, 'an allow has nowhere to route to');

    // A command that is not a release records nothing at all.
    const countBefore = rows().length;
    await bash('make test');
    assert.equal(rows().length, countBefore);
  } finally { r.cleanup(); }
});

test('the CLI writes, reads and revokes the record, and the agent cannot run the approve command', async () => {
  const r = repo();
  try {
    assert.equal(cli(r.root, 'release', 'status').status, 1, 'no record is a non-zero status');
    const approved = cli(r.root, 'release', 'approve', '--by', 'the release manager', '--minutes', '15');
    assert.equal(approved.status, 0, approved.stderr);
    assert.match(approved.stdout, /release approved/);
    assert.ok(existsSync(release.file(r.cfg())));

    const status = cli(r.root, 'release', 'status');
    assert.equal(status.status, 0);
    assert.match(JSON.parse(status.stdout).reason, /approved by the release manager/);

    assert.equal(cli(r.root, 'release', 'approve').status, 1, 'an approval with no approver is refused');
    assert.match(cli(r.root, 'release', 'revoke').stdout, /revoked/);
    assert.equal(cli(r.root, 'release', 'status').status, 1);
    assert.equal(cli(r.root, 'release', 'wat').status, 2);

    // The whole point of a record over a variable is that the agent cannot write it either.
    // `approve-is-the-humans` covers the release verb for the same reason it covers a gate —
    // asserted by running the hook, not by reading the regex that implements it.
    const refusal = await bashHook(r.root, 'node .aidlc/bin/harness release approve --by me');
    assert.match(refusal, /approval is the human/i);
    assert.match(refusal, /"permissionDecision":"deny"/);
  } finally { r.cleanup(); }
});

test('the project template tells a consumer how to authorise a release and how to roll one back', () => {
  const template = readFileSync(new URL('../.aidlc/templates/project-instructions.md', import.meta.url), 'utf8');
  assert.match(template, /harness release approve --by/);
  assert.match(template, /harness release revoke/);
  // A rollback command nobody wrote down is a rollback command nobody has at three in the morning.
  assert.match(template, /Rollback: <replace this line/);
});
