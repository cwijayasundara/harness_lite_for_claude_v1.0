import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { C } from './_paths.mjs';
import { writeBlocked, productionDenied, lockTests, clearLock, bandTier, classifyBands } from '../.claude/lib/guard.mjs';

const BIN = path.join(C, 'bin', 'harness');

function tmp(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  const layout = {
    root,
    claude: path.join(root, '.claude'),
    plan: path.join(root, '.claude/artifacts/plan'),
    state: path.join(root, '.claude/state'),
  };
  mkdirSync(layout.plan, { recursive: true });
  mkdirSync(layout.state, { recursive: true });
  return { root, layout, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('require_plan is off by default so product edits are not blocked', () => {
  const f = tmp('guard-off-'); try {
    assert.equal(writeBlocked('src/app.py', { layout: f.layout, guard: {} }), null);
  } finally { f.cleanup(); }
});

test('require_plan blocks a product file when no approved plan lists it', () => {
  const f = tmp('guard-on-'); try {
    const cfg = { layout: f.layout, guard: { require_plan: true } };
    assert.match(writeBlocked('src/app.py', cfg), /approved plan/);
    writeFileSync(path.join(f.layout.plan, 'change.md'), '- **Status:** approved\n\n## Files\n```\nsrc/app.py\n```\n');
    assert.equal(writeBlocked('src/app.py', cfg), null);
    assert.match(writeBlocked('src/other.py', cfg), /not named/);
    assert.equal(writeBlocked('.claude/artifacts/intent/change.md', cfg), null);
  } finally { f.cleanup(); }
});

test('a malformed approved plan must not wedge the session', () => {
  const f = tmp('guard-bad-'); try {
    writeFileSync(path.join(f.layout.plan, 'change.md'), '- **Status:** approved\n\n## Files\nno fence\n');
    assert.equal(writeBlocked('src/app.py', { layout: f.layout, guard: { require_plan: true } }), null);
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
    writeFileSync(path.join(f.layout.claude, 'harness.toml'), '[project]\nname = "t"\n');
    const locked = spawnSync(process.execPath, [BIN, 'lock', 'tests', '--pattern', 'tests/'], { cwd: f.root, encoding: 'utf8' });
    assert.equal(locked.status, 0, locked.stderr);
    const body = JSON.parse(readFileSync(path.join(f.layout.state, 'test-lock.json'), 'utf8'));
    assert.deepEqual(body.patterns, ['tests/']);
    const cleared = spawnSync(process.execPath, [BIN, 'lock', 'clear'], { cwd: f.root, encoding: 'utf8' });
    assert.equal(cleared.status, 0, cleared.stderr);
    assert.equal(existsSync(path.join(f.layout.state, 'test-lock.json')), false);
  } finally { f.cleanup(); }
});
