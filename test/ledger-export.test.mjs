import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { layout } from '../.aidlc/lib/paths.mjs';
import { check } from '../.aidlc/lib/runner.mjs';
import { exportInvocation, report as auditReport } from '../.aidlc/lib/ledger.mjs';
import { seedRuntimeRecord } from './_runtime-fixture.mjs';
import { BIN } from './_paths.mjs';
function setup(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'ledger-export-'));
  t.after(() => rmSync(root, { recursive: true, force: true })); seedRuntimeRecord(root);
  return { layout: layout(root), capabilities: { test: 'exit 0' }, formats: {}, stages: { trial: ['test'] }, budget: { max_findings: 20 } };
}
test('export preserves actor, invocation and original report; stale report is unavailable', async t => {
  const cfg = setup(t);
  const r = await check(cfg, { stage: 'trial', actor: 'simulated-reviewer' });
  assert.equal(r.ok, true, JSON.stringify(r.identity_errors));
  const e = exportInvocation(cfg.layout, r.provenance.invocation);
  assert.equal(e.report_state, 'available'); assert.deepEqual(e.report.provenance, r.provenance);
  assert.deepEqual(e.provenance.actor, { label: 'simulated-reviewer', provenance: 'explicit-label', authenticated: false });
  assert.equal(e.controls[0].verdict, 'pass');
  const cli = spawnSync(process.execPath, [BIN, 'ledger', 'export', '--invocation', r.provenance.invocation], { cwd: cfg.layout.root, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr); assert.equal(JSON.parse(cli.stdout).invocation, r.provenance.invocation);
  const next = await check(cfg, { stage: 'trial', actor: 'second-actor' });
  assert.notEqual(next.provenance.invocation, r.provenance.invocation);
  assert.equal(exportInvocation(cfg.layout, r.provenance.invocation).report_state, 'unavailable');
  assert.equal(exportInvocation(cfg.layout, r.provenance.invocation).provenance.actor.label, 'simulated-reviewer');
  assert.equal(auditReport(cfg.layout).rows, 2, 'invocation summary is not a control');
});
test('malformed, missing, inconsistent and legacy evidence cannot gain attribution', async t => {
  const cfg = setup(t); const r = await check(cfg, { stage: 'trial' });
  assert.throws(() => exportInvocation(cfg.layout, 'latest'), /invalid/);
  assert.throws(() => exportInvocation(cfg.layout, '00000000-0000-0000-0000-000000000000'), /not found/);
  const raw = readFileSync(cfg.layout.lastCheck, 'utf8');
  const changed = JSON.parse(raw); changed.controls[0].verdict = 'fail';
  writeFileSync(cfg.layout.lastCheck, JSON.stringify(changed));
  assert.throws(() => exportInvocation(cfg.layout, r.provenance.invocation), /inconsistent/);
  writeFileSync(cfg.layout.lastCheck, raw);
  appendFileSync(cfg.layout.ledger, '{broken\n');
  assert.throws(() => exportInvocation(cfg.layout, r.provenance.invocation), /malformed/);
  writeFileSync(cfg.layout.ledger, JSON.stringify({ control: 'test', verdict: 'pass', actor: 'legacy' }) + '\n');
  assert.throws(() => exportInvocation(cfg.layout, r.provenance.invocation), /legacy/);
});
test('direct consumer check refuses invalid runtime and policy mutation invalidates evidence', async t => {
  const cfg = setup(t);
  cfg.capabilities.test = "printf altered > .aidlc/instructions.md";
  const r = await check(cfg, { stage: 'trial' });
  assert.equal(r.ok, false); assert.match(r.identity_errors.join(' '), /changed during/);
  writeFileSync(path.join(cfg.layout.root, '.aidlc/harness-install.json'), '{}');
  const invalid = await check(cfg, { stage: 'trial' });
  assert.equal(invalid.ok, false); assert.equal(invalid.controls[0].verdict, 'skipped');
  assert.match(invalid.identity_errors.join(' '), /unverified/);
  assert.equal(exportInvocation(cfg.layout, invalid.provenance.invocation).summary.ok, false);
  await assert.rejects(check(cfg, { stage: 'trial', actor: true }), /actor/);
});
