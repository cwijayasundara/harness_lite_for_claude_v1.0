import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildPackage, EXCLUDED_TOP_LEVEL } from '../release/package.mjs';
import { ROOT } from './_paths.mjs';

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

test('runtime package is semantic, immutable and excludes research surfaces', (t) => {
  const temp = mkdtempSync(path.join(tmpdir(), 'runtime-package-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const out = path.join(temp, 'plugin');
  const release = buildPackage({ root: ROOT, out, allowDirty: true });
  assert.match(release.version, /^\d+\.\d+\.\d+$/);
  assert.equal(git(out, 'status', '--porcelain'), '');
  assert.equal(git(out, 'rev-parse', 'HEAD'), release.package_commit);
  assert.equal(JSON.parse(readFileSync(path.join(out, 'RELEASE.json'))).source_commit, git(ROOT, 'rev-parse', 'HEAD'));
  for (const excluded of EXCLUDED_TOP_LEVEL) assert.equal(existsSync(path.join(out, excluded)), false, `${excluded} leaked into runtime package`);
  assert.ok(existsSync(path.join(out, '.claude/harness/bin/harness')));
  assert.ok(existsSync(path.join(out, '.claude-plugin/plugin.json')));
});

test('clean install, upgrade, downgrade and uninstall preserve verified pins', (t) => {
  const temp = mkdtempSync(path.join(tmpdir(), 'release-lifecycle-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const current = path.join(temp, 'current');
  buildPackage({ root: ROOT, out: current, allowDirty: true });

  const prior = path.join(temp, 'prior');
  cpSync(current, prior, { recursive: true, filter: (source) => path.basename(source) !== '.git' });
  git(prior, 'init', '-q');
  const manifest = path.join(prior, '.claude-plugin/plugin.json');
  const plugin = JSON.parse(readFileSync(manifest)); plugin.version = '0.1.0';
  writeFileSync(manifest, JSON.stringify(plugin, null, 2) + '\n');
  git(prior, 'add', '-A');
  execFileSync('git', ['-c', 'user.name=Prior', '-c', 'user.email=prior@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-qm', 'prior release'], { cwd: prior });

  const project = path.join(temp, 'project');
  const init = (runtime) => execFileSync(process.execPath,
    [path.join(runtime, '.claude/harness/bin/harness'), 'init', '--into', project], { cwd: temp });
  const doctor = (runtime) => spawnSync('bash', [path.join(project, '.claude/harness/bin/harness'), 'doctor', '--json'],
    { cwd: project, encoding: 'utf8', env: { ...process.env, HARNESS_HOME: runtime } });

  init(prior);
  assert.equal(doctor(prior).status, 0, doctor(prior).stderr);
  assert.equal(JSON.parse(readFileSync(path.join(project, '.claude/harness/harness-install.json'))).version, '0.1.0');

  init(current);
  assert.equal(doctor(current).status, 0, doctor(current).stderr);
  assert.equal(JSON.parse(readFileSync(path.join(project, '.claude/harness/harness-install.json'))).version, '0.2.0');

  init(prior);
  assert.equal(doctor(prior).status, 0, doctor(prior).stderr);
  assert.equal(JSON.parse(readFileSync(path.join(project, '.claude/harness/harness-install.json'))).version, '0.1.0');

  rmSync(prior, { recursive: true, force: true });
  const gone = doctor(prior);
  assert.notEqual(gone.status, 0);
  assert.match(gone.stderr, /HARNESS_HOME.*holds no/);
});

test('compatibility and cohort policy are explicit and internally consistent', () => {
  const plugin = JSON.parse(readFileSync(path.join(ROOT, '.claude-plugin/plugin.json')));
  const rollout = JSON.parse(readFileSync(path.join(ROOT, 'release/rollout.json')));
  const compatibility = readFileSync(path.join(ROOT, 'docs/COMPATIBILITY.md'), 'utf8');
  assert.equal(rollout.version, plugin.version);
  assert.deepEqual(rollout.cohorts.map((cohort) => cohort.id), ['maintainers', 'early-adopters', 'general']);
  assert.ok(rollout.admission.length >= 4 && rollout.halt.length >= 4);
  assert.match(compatibility, /Node\.js \*\*22 through 25\*\*/);
  assert.match(compatibility, /Claude Code \*\*2\.1\.263/);
  assert.match(compatibility, /clean install, upgrade or downgrade/);
});
