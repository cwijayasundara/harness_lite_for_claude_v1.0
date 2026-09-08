import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, chmodSync, symlinkSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT, BIN } from './_paths.mjs';
import { runtimeIdentity, installationIdentity, policyIdentity } from '../.aidlc/lib/runtime-identity.mjs';

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'identity-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const runtime = path.join(dir, 'runtime'); mkdirSync(runtime);
  for (const rel of ['.aidlc/bin', '.aidlc/lib', '.aidlc/checks', '.aidlc/sensors', '.aidlc/hooks', '.aidlc/adapters', '.aidlc/skills', '.aidlc/roles', '.aidlc/templates', '.aidlc/policies', '.aidlc/instructions.md', '.claude-plugin']) cpSync(path.join(ROOT, rel), path.join(runtime, rel), { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: runtime, encoding: 'utf8' }).trim();
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'runtime');
  const project = path.join(dir, 'project'); mkdirSync(project);
  execFileSync(process.execPath, [path.join(runtime, '.aidlc/bin/harness'), 'init', '--into', project]);
  return { dir, runtime, project, git, shim: path.join(project, '.aidlc/bin/harness') };
}

test('installer pins exact runtime; wrong Git commit, bytes and mode cannot pass', t => {
  const f = fixture(t);
  const expected = installationIdentity(f.runtime);
  assert.equal(expected.status, 'verified');
  assert.equal(runtimeIdentity(f.project, f.runtime).status, 'verified');
  f.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'different');
  assert.equal(runtimeIdentity(f.project, f.runtime).status, 'mismatch');
  const r = spawnSync('bash', [f.shim, 'doctor'], { cwd: f.project, encoding: 'utf8', env: { ...process.env, HARNESS_HOME: f.runtime } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /mismatch/);
  f.git('checkout', '--detach', expected.commit);
  const file = path.join(f.runtime, '.aidlc/lib/paths.mjs');
  writeFileSync(file, readFileSync(file, 'utf8') + '\n// altered\n');
  assert.equal(runtimeIdentity(f.project, f.runtime).status, 'mismatch');
  assert.notEqual(installationIdentity(f.runtime).status, 'verified');
  f.git('checkout', '--', '.aidlc/lib/paths.mjs'); chmodSync(file, 0o755);
  assert.equal(runtimeIdentity(f.project, f.runtime).status, 'mismatch');
});

test('cache content matches without pretending to verify Git; legacy and symlinks fail', t => {
  const f = fixture(t); const cache = path.join(f.dir, 'cache');
  cpSync(f.runtime, cache, { recursive: true, filter: p => path.basename(p) !== '.git' });
  const identity = runtimeIdentity(f.project, cache);
  assert.equal(identity.status, 'verified'); assert.equal(identity.method, 'pinned-content'); assert.equal(identity.observed.commit, null);
  symlinkSync('/tmp', path.join(cache, '.aidlc/lib/escape'));
  assert.equal(runtimeIdentity(f.project, cache).status, 'mismatch');
  writeFileSync(path.join(f.project, '.aidlc/harness-install.json'), '{"commit":"unknown"}');
  assert.equal(runtimeIdentity(f.project, f.runtime).status, 'unverified');
});

test('policy digest is location independent and distinguishes edits and absent inputs', t => {
  const f = fixture(t); const copy = path.join(f.dir, 'copy'); cpSync(f.project, copy, { recursive: true });
  assert.equal(policyIdentity(copy).digest, policyIdentity(f.project).digest);
  writeFileSync(path.join(copy, 'CLAUDE.md'), 'Additional project policy\n');
  assert.notEqual(policyIdentity(copy).digest, policyIdentity(f.project).digest);
  const doctor = spawnSync('bash', [f.shim, 'doctor', '--json'], { cwd: f.project, encoding: 'utf8', env: { ...process.env, HARNESS_HOME: f.runtime } });
  assert.equal(doctor.status, 0, doctor.stderr);
  const result = JSON.parse(doctor.stdout); assert.equal(result.runtime.status, 'verified'); assert.equal(result.policy.digest, policyIdentity(f.project).digest);
});

test('explicit wrong runtime cannot execute or fall back to a valid cache', t => {
  const f = fixture(t);
  const rec = JSON.parse(readFileSync(path.join(f.project, '.aidlc/harness-install.json'), 'utf8'));
  const home = path.join(f.dir, 'home');
  const cache = path.join(home, '.claude/plugins/cache', rec.marketplace, rec.plugin, rec.version);
  cpSync(f.runtime, cache, { recursive: true, filter: p => path.basename(p) !== '.git' });
  const bad = path.join(f.dir, 'bad'); cpSync(cache, bad, { recursive: true });
  const marker = path.join(f.dir, 'executed');
  writeFileSync(path.join(bad, '.aidlc/bin/harness'), `require('fs').writeFileSync(${JSON.stringify(marker)}, 'unsafe');`);
  const r = spawnSync('bash', [f.shim, 'doctor'], { cwd: f.project, encoding: 'utf8', env: { ...process.env, HOME: home, HARNESS_HOME: bad } });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /no fallback/);
  assert.throws(() => readFileSync(marker), /ENOENT/);
  const good = spawnSync('bash', [f.shim, 'doctor', '--json'], { cwd: f.project, encoding: 'utf8', env: { ...process.env, HOME: home, HARNESS_HOME: '' } });
  assert.equal(good.status, 0, good.stderr); assert.equal(JSON.parse(good.stdout).runtime.method, 'pinned-content');
});

test('runtime drift during an executing consumer check invalidates its exported proof', t => {
  const f = fixture(t);
  // The configured test intentionally changes a covered runtime file in this disposable copy.
  const target = path.join(f.runtime, '.aidlc/lib/paths.mjs');
  const shell = "printf '\\n// changed by fixture check\\n' >> '" + target.replaceAll("'", "'\\''") + "'";
  writeFileSync(path.join(f.project, '.aidlc/harness.toml'), `[project]\nname = "mutation"\n[capabilities]\ntest = ${JSON.stringify(shell)}\n[stages]\ntrial = ["test"]\n`);
  const r = spawnSync('bash', [f.shim, 'check', '--stage', 'trial', '--actor', 'simulated-engineer', '--json'], { cwd: f.project, encoding: 'utf8', env: { ...process.env, HARNESS_HOME: f.runtime } });
  assert.equal(r.status, 1, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.controls[0].verdict, 'pass'); assert.equal(report.ok, false);
  assert.match(report.identity_errors.join(' '), /changed during/); assert.equal(report.provenance.consistent, false);
});

test('policy committed state checks raw blobs even when Git index hides edits', t => {
  const f = fixture(t);
  const git = (...args) => execFileSync('git', args, { cwd: f.project, encoding: 'utf8' }).trim();
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'policy');
  assert.equal(policyIdentity(f.project).state, 'committed');
  git('update-index', '--assume-unchanged', '.aidlc/instructions.md');
  writeFileSync(path.join(f.project, '.aidlc/instructions.md'), 'Changed despite index flag\n');
  assert.equal(policyIdentity(f.project).state, 'dirty');
});
