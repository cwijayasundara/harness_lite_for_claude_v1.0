// Pre-fix product installation trial. Changes only disposable copies; no approvals.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stage, FIXTURES } from '../../../evals/lib/stage.mjs';

const root = process.cwd();
const s = stage(FIXTURES, 'contract-planned');
const runtime = mkdtempSync(path.join(tmpdir(), 'team-reuse-runtime-'));
try {
  const archive = execFileSync('git', ['archive', 'HEAD', '.aidlc', '.claude', '.claude-plugin'], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', runtime], { input: archive });
  execFileSync('git', ['init', '-q'], { cwd: runtime });
  execFileSync('git', ['add', '.'], { cwd: runtime });
  execFileSync('git', ['-c', 'user.name=Simulated fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Different runtime revision'], { cwd: runtime });
  const init = spawnSync(process.execPath, [path.join(root, '.aidlc/bin/harness'), 'init', '--into', s.work], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const record = JSON.parse(readFileSync(path.join(s.work, '.aidlc/harness-install.json'), 'utf8'));
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: runtime, encoding: 'utf8' }).trim();
  assert.notEqual(actual, record.commit);
  const doctor = spawnSync('bash', [path.join(s.work, '.aidlc/bin/harness'), 'doctor'], {
    cwd: s.work, encoding: 'utf8', env: { ...process.env, HARNESS_HOME: runtime },
  });
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.doesNotMatch(doctor.stdout + doctor.stderr, /mismatch|unverified/i);
  const result = {
    repository_revision: record.commit, fixture: 'contract-planned',
    expected_runtime_commit: record.commit, actual_runtime_commit: actual,
    doctor_exit: doctor.status, doctor_stdout: doctor.stdout, doctor_stderr: doctor.stderr,
    defect: 'Consumer shim executes a different Git runtime revision; doctor succeeds without an identity diagnostic.',
    simulated_runtime_repository: true, source_fixtures_modified: false, approvals_created: false,
  };
  mkdirSync('.aidlc/artifacts/team-reuse', { recursive: true });
  writeFileSync('.aidlc/artifacts/team-reuse/reproduction.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { s.cleanup(); rmSync(runtime, { recursive: true, force: true }); }
