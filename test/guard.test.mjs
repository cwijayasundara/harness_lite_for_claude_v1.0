import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { C, BIN } from './_paths.mjs';
import { writeBlocked, productionDenied, lockTests, clearLock, bandTier, classifyBands, bashTouchesProtected, bashContractBlocked } from '../.aidlc/lib/guard.mjs';
import { FIXTURES, stage } from '../evals/lib/stage.mjs';


function tmp(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  const layout = {
    root,
    aidlc: path.join(root, '.aidlc'),
    claude: path.join(root, '.claude'),
    state: path.join(root, '.aidlc/state'),
  };
  mkdirSync(path.join(root, ".aidlc/artifacts/contracts"), { recursive: true });
  mkdirSync(layout.state, { recursive: true });
  return { root, layout, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// Spec behaviour 14. The old check asked whether the command contained `>` *anywhere* and then
// whether a protected path appeared *anywhere*. `2>&1` supplies the first and any mention of the
// file supplies the second, so reading a protected file was denied. It fired six times against
// read-only commands while this change was being written — including on the attempt to write the
// intent describing it, because the prose named a protected path. A guard that blocks reading is
// one people learn to route around, and a routed-around guard protects nothing.
test('a command that only reads a protected path is allowed', () => {
  const paths = ['.claude/settings.json', '.aidlc/harness.toml', 'CLAUDE.md'];
  for (const cmd of [
    'head -n 30 .claude/settings.json',
    'cat .aidlc/harness.toml 2>&1',
    'grep -n foo .aidlc/harness.toml 2>/dev/null',
    'cat .aidlc/templates/project-instructions.md 2>&1 | head -5',
    'cp ~/.claude/settings.json /tmp/backup.json',
    'node -e "1" > /tmp/out.txt',
  ]) {
    assert.equal(bashTouchesProtected(cmd, paths), null, `denied a read-only command: ${cmd}`);
  }
});

// Spec behaviour 15. Narrowing the guard must not open it. These are the writes it exists for.
test('a command that writes to a protected path is still denied', () => {
  const paths = ['.claude/settings.json', '.aidlc/harness.toml', 'CLAUDE.md'];
  for (const cmd of [
    'echo x > .claude/settings.json',
    'echo x >> .aidlc/harness.toml',
    "sed -i '' s/a/b/ .aidlc/harness.toml",
    'cat x | tee CLAUDE.md',
    'cp /tmp/other.json .claude/settings.json',
    'mv .claude/settings.json /tmp/',
    'truncate -s 0 .aidlc/harness.toml',
  ]) {
    assert.ok(bashTouchesProtected(cmd, paths), `allowed a write to a protected path: ${cmd}`);
  }
});

// p0 B7 of eval-suite-tells-the-truth. The prompt-prefix guard matched `norm.endsWith('/' + p)`,
// so every nested copy counted as the prefix: editing `evals/fixtures/_base/.aidlc/harness.toml`
// — a fixture never read into any prompt — was refused as cache invalidation. `norm` is already
// repo-relative, so identity is the whole test. The control had no unit coverage before this.
test('a nested copy of a prompt-prefix file is not the prompt prefix', () => {
  const f = tmp('prefix-'); try {
    const cfg = { layout: f.layout, guard: {} };
    for (const rel of [
      'evals/fixtures/_base/.aidlc/harness.toml',
      'evals/fixtures/clean-app/.claude/CLAUDE.md',
      'examples/scratch-py/.claude/settings.json',
    ]) assert.equal(writeBlocked(rel, cfg), null, `refused a nested copy: ${rel}`);

    // And the repository's own files are still the prefix.
    for (const rel of ['.aidlc/harness.toml', '.claude/CLAUDE.md', '.claude/settings.json']) {
      assert.match(String(writeBlocked(rel, cfg)), /cached prompt prefix/, `stopped guarding ${rel}`);
    }
  } finally { f.cleanup(); }
});

function contractCfg(f) {
  return {
    layout: { ...f.layout, contracts: path.join(f.root, '.aidlc/artifacts/contracts') },
    guard: { require_contract: true },
  };
}

// p0-unblock-the-loop B1. bashContractBlocked was left on the string test that
// bashTouchesProtected had already been repaired for, so it read a `>` anywhere as a write. It
// refused `2>/dev/null`, it refused `harness check --stage stop 2>&1 | tail` — the command
// CLAUDE.md calls non-negotiable — and it refused every commit carrying a `Co-Authored-By`
// trailer, because a mail address ends in `>`. Three separate refusals in the session that
// found it.
test('the contract guard does not block a command that writes no product file', () => {
  const f = tmp('contract-guard-read-'); try {
    const cfg = contractCfg(f);
    for (const cmd of [
      'echo hi 2>/dev/null | head -1',
      'node .aidlc/bin/harness check --stage stop 2>&1 | tail -30',
      'git commit -q -m "fix: x" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"',
      'grep -rn contractScopeState .aidlc/lib 2>/dev/null',
      'ls -la > /dev/null',
      'node .aidlc/bin/harness status >> .aidlc/state/last-check.json',
      // The carve-out is about the artifact and state trees, not about how they were spelled.
      `echo x > ${f.root}/.aidlc/artifacts/intent/foo.md`,
      `echo x > ${f.root}/.aidlc/state/scratch`,
      'echo x > ./.aidlc/state/scratch',
    ]) assert.equal(bashContractBlocked(cmd, cfg), null, `blocked a command that writes no product file: ${cmd}`);
  } finally { f.cleanup(); }
});

// p0-unblock-the-loop B2. Narrowing the guard must not open it.
test('the contract guard still blocks an unowned write to a product file', () => {
  const f = tmp('contract-guard-write-'); try {
    const cfg = contractCfg(f);
    for (const cmd of [
      'echo x > src/app.py',
      'echo x >> src/app.py',
      "sed -i '' s/a/b/ src/app.py",
      'cat x | tee src/app.py',
      'node build.mjs 2>&1 > dist/out.js',
      'cp /tmp/other.py src/app.py',
    ]) assert.ok(bashContractBlocked(cmd, cfg), `allowed an unowned product write: ${cmd}`);
  } finally { f.cleanup(); }
});

test('scope guard remains configurable for non-product repositories', () => {
  const f = tmp('guard-off-'); try {
    assert.equal(writeBlocked('src/app.py', { layout: f.layout, guard: {} }), null);
  } finally { f.cleanup(); }
});

test('require_contract permits only paths owned by a committed approved contract', () => {
  const s = stage(FIXTURES, 'contract-planned'); try {
    const layout = { root: s.work, contracts: path.join(s.work, '.aidlc/artifacts/contracts'), state: path.join(s.work, '.aidlc/state') };
    const cfg = { layout, guard: { require_contract: true } };
    assert.equal(writeBlocked('src/app/text.py', cfg), null);
    assert.match(writeBlocked('src/app/handlers.py', cfg), /outside every approved contract/);
    assert.equal(writeBlocked('.aidlc/artifacts/intent-refs/change.json', cfg), null);
  } finally { s.cleanup(); }
});

test('a malformed contract fails closed for product writes', () => {
  const f = tmp('guard-bad-'); try {
    f.layout.contracts = path.join(f.root, '.aidlc/artifacts/contracts'); mkdirSync(f.layout.contracts, { recursive: true });
    writeFileSync(path.join(f.layout.contracts, 'change.md'), '# malformed contract\n');
    assert.match(writeBlocked('src/app.py', { layout: f.layout, guard: { require_contract: true } }), /approved delivery contract/);
  } finally { f.cleanup(); }
});

test('production deploy without an approval identifier is denied', () => {
  assert.match(productionDenied('deploy --env production', {}), /release authorization/);
  assert.equal(productionDenied('deploy --env production', { HARNESS_RELEASE_APPROVAL: 'CAB-1' }), null);
  assert.equal(productionDenied('make test', {}), null);
  assert.match(productionDenied('harness deploy deploy production', {}), /release authorization/);
});

test('lock tests writes a lock the write guard honors, and clear removes it', () => {
  const f = tmp('guard-lock-'); try {
    const cfg = { layout: f.layout, guard: {} };
    lockTests(cfg, { patterns: ['tests/test_calc.py'], why: 'bug fix in progress' });
    assert.match(writeBlocked('tests/test_calc.py', cfg), /test-locked/);
    assert.equal(writeBlocked('src/calc.py', cfg), null);
    clearLock(cfg);
    assert.equal(existsSync(path.join(f.layout.state, 'test-lock.json')), false);
    assert.equal(writeBlocked('tests/test_calc.py', cfg), null);
  } finally { f.cleanup(); }
});

test('sigma tiers: 1σ does not propose, 3σ and min/max breaches do', () => {
  assert.equal(bandTier({ metric: 'x', observed: 0.22, mean: 0.1, stdev: 0.1 }), 1);
  assert.equal(bandTier({ metric: 'x', observed: 0.45, mean: 0.1, stdev: 0.1 }), 3);
  assert.equal(bandTier({ metric: 'x', observed: 0.12, max: 0.05 }), 3);
  assert.equal(bandTier({ metric: 'x', observed: 0.01, max: 0.05 }), 0);
  const c = classifyBands({ bands: [
    { metric: 'a', observed: 0.22, mean: 0.1, stdev: 0.1 },
    { metric: 'b', observed: 0.45, mean: 0.1, stdev: 0.1 },
  ] });
  assert.equal(c.log.length, 1);
  assert.equal(c.propose.length, 1);
  assert.equal(c.diagnose.length, 1);
});

test('harness lock tests / lock clear round-trips through the CLI', () => {
  const f = tmp('guard-cli-'); try {
    spawnSync('git', ['init', '-q'], { cwd: f.root });
    writeFileSync(path.join(f.layout.aidlc, 'harness.toml'), '[project]\nname = "t"\n');
    const locked = spawnSync(process.execPath, [BIN, 'lock', 'tests', '--pattern', 'tests/'], { cwd: f.root, encoding: 'utf8' });
    assert.equal(locked.status, 0, locked.stderr);
    const body = JSON.parse(readFileSync(path.join(f.layout.state, 'test-lock.json'), 'utf8'));
    assert.deepEqual(body.patterns, ['tests/']);
    const cleared = spawnSync(process.execPath, [BIN, 'lock', 'clear'], { cwd: f.root, encoding: 'utf8' });
    assert.equal(cleared.status, 0, cleared.stderr);
    assert.equal(existsSync(path.join(f.layout.state, 'test-lock.json')), false);
  } finally { f.cleanup(); }
});
