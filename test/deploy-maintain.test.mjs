import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assess, SCHEMA } from '../examples/deploy/pipeline-evidence.mjs';
import { ROOT } from './_paths.mjs';

const base = () => ({
  schema: SCHEMA, release: 'release-17', candidate: 'abc123', artifact: 'image@sha256:17',
  migration: { reversible: true },
  events: [
    { event: 'deployed', environment: 'staging', at: '2026-09-18T10:00:00Z', candidate: 'abc123', artifact: 'image@sha256:17' },
    { event: 'smoke', environment: 'staging', at: '2026-09-18T10:02:00Z', result: 'pass' },
    { event: 'authorized', environment: 'production', at: '2026-09-18T10:03:00Z', candidate: 'abc123', approved_by: 'release-manager' },
    { event: 'deployed', environment: 'production', at: '2026-09-18T10:05:00Z', candidate: 'abc123', artifact: 'image@sha256:17' },
    { event: 'healthy', environment: 'production', at: '2026-09-18T10:20:00Z', result: 'pass', window_minutes: 15 },
  ],
});

test('existing-pipeline evidence binds authorization, artifact, environment and health window', () => {
  const result = assess(base());
  assert.equal(result.ok, true, result.findings.join('; '));
  assert.equal(result.authorization.approved_by, 'release-manager');
  assert.equal(result.health.window_minutes, 15);
  assert.equal(result.artifact, 'image@sha256:17');
});

test('failed staging smoke cannot promote and reversible production failure rolls back', () => {
  const promoted = base();
  promoted.events.find((event) => event.event === 'smoke').result = 'fail';
  assert.match(assess(promoted).findings.join('; '), /promotion followed a non-passing staging smoke/);

  const failed = base();
  failed.events = failed.events.filter((event) => event.event !== 'healthy');
  failed.events.push({ event: 'rollback', environment: 'production', at: '2026-09-18T10:10:00Z', result: 'pass', artifact: 'image@sha256:16' });
  assert.equal(assess(failed).ok, true);
});

test('irreversible migration failure escalates and forbids automatic rollback', () => {
  const failed = base();
  failed.migration = { reversible: false, boundary: 'customer IDs backfilled destructively' };
  failed.events = failed.events.filter((event) => event.event !== 'healthy');
  failed.events.push({ event: 'escalated', environment: 'production', at: '2026-09-18T10:10:00Z', result: 'pass' });
  assert.equal(assess(failed).ok, true);
  failed.events.push({ event: 'rollback', environment: 'production', at: '2026-09-18T10:11:00Z', result: 'pass' });
  assert.match(assess(failed).findings.join('; '), /irreversible migration/);
});

test('a release-linked band diagnosis is bounded, deduplicated and cooled down', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'maintain-phase6-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'ops@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Ops'], { cwd: root });
    mkdirSync(path.join(root, '.claude/harness/artifacts'), { recursive: true });
    const observation = {
      observed_at: '2026-09-18T10:00:00Z', cooldown_minutes: 30,
      release: 'release-17', environment: 'staging',
      evidence: ['error rate rose after release-17', 'trace: overdueJob', 'log: duplicate batch', 'fourth', 'fifth', 'excluded-sixth'],
      bands: [{ metric: 'overdue_rate', observed: 0.31, mean: 0.12, stdev: 0.04 }],
    };
    writeFileSync(path.join(root, 'bands.json'), JSON.stringify(observation, null, 2));
    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync('git', ['commit', '-qm', 'record release observation'], { cwd: root });
    const script = path.join(ROOT, 'examples/maintain/band-to-intent.mjs');
    const first = spawnSync(process.execPath, [script, 'bands.json'], { cwd: root, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const intent = readFileSync(path.join(root, '.claude/harness/artifacts/overdue-rate-breach/intent.md'), 'utf8');
    assert.match(intent, /Release:\*\* release-17 in staging/);
    assert.match(intent, /trace: overdueJob/);
    assert.doesNotMatch(intent, /excluded-sixth/);

    const second = spawnSync(process.execPath, [script, 'bands.json'], { cwd: root, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /COOLDOWN/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
