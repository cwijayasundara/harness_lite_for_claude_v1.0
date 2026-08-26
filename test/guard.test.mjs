import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { C, BIN } from './_paths.mjs';
import { writeBlocked, productionDenied, lockTests, clearLock, bandTier, classifyBands, bashTouchesProtected } from '../.aidlc/lib/guard.mjs';
import { FIXTURES, stage } from '../evals/lib/stage.mjs';


function tmp(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  const layout = {
    root,
    aidlc: path.join(root, '.aidlc'),
    claude: path.join(root, '.claude'),
    plan: path.join(root, '.aidlc/artifacts/plan'),
    state: path.join(root, '.aidlc/state'),
  };
  mkdirSync(layout.plan, { recursive: true });
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
