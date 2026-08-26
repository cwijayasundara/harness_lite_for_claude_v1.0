import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deploy, closeLoop, breachedBands, detect, validateDeploymentReceipt } from '../.aidlc/lib/operations.mjs';

const A = `sha256:${'a'.repeat(64)}`;
const B = `sha256:${'b'.repeat(64)}`;

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'operations-'));
  const artifacts = path.join(root, '.aidlc/artifacts');
  const layout = { root, deployment: path.join(artifacts, 'deployment'), incident: path.join(artifacts, 'incident'), intent: path.join(artifacts, 'intent') };
  mkdirSync(path.join(root, 'bin'), { recursive: true });
  const adapter = path.join(root, 'bin', 'adapter');
  writeFileSync(adapter, '#!/bin/sh\nprintf "environment=%s approval=%s\\n" "$1" "$HARNESS_RELEASE_APPROVAL"\n'); chmodSync(adapter, 0o755);
  return { root, layout, adapter, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('deployment adapter writes a durable receipt and gates production', () => {
  const f = fixture(); try {
    const cfg = { layout: f.layout, deployment: { deploy: [f.adapter], status: [f.adapter], rollback: [f.adapter], production_requires_approval: true, require_preflight: false, production_allowed_risks: ['low', 'standard', 'critical'] } };
    assert.throws(() => deploy(cfg, 'deploy', 'production', { artifact: A }), /requires 1 independent approval/);
    const result = deploy(cfg, 'deploy', 'production', { artifact: A, approval: 'CAB-42', now: new Date('2026-01-01T00:00:00Z') });
    assert.equal(result.ok, true); assert.ok(existsSync(result.file));
    const receipt = JSON.parse(readFileSync(result.file, 'utf8'));
    assert.equal(receipt.approval, 'CAB-42'); assert.match(receipt.stdout, /environment=production approval=CAB-42/);
  } finally { f.cleanup(); }
});

test('full deployment lifecycle promotes only the verified immutable artifact and receipts every action', () => {
  const f = fixture(); try {
    const cfg = { layout: { ...f.layout, state: path.join(f.root, '.aidlc/state') }, deployment: {
      preflight: [f.adapter], deploy: [f.adapter], status: [f.adapter], verify: [f.adapter], promote: [f.adapter], rollback: [f.adapter],
      production_requires_approval: true, production_allowed_risks: ['low', 'standard', 'critical'], critical_approvals: 2, require_preflight: true,
    } };
    const receipts = [];
    receipts.push(deploy(cfg, 'preflight', 'staging', { artifact: A }));
    receipts.push(deploy(cfg, 'deploy', 'staging', { artifact: A }));
    receipts.push(deploy(cfg, 'status', 'staging'));
    receipts.push(deploy(cfg, 'verify', 'staging', { artifact: A }));
    receipts.push(deploy(cfg, 'preflight', 'production', { artifact: A }));
    const promoted = deploy(cfg, 'promote', 'production', { from: 'staging', artifact: A, approval: 'CAB-1' }); receipts.push(promoted);
    assert.equal(promoted.receipt.artifact_digest, A); assert.equal(promoted.receipt.verification_receipt != null, true);
    for (const result of receipts) assert.deepEqual(validateDeploymentReceipt(JSON.parse(readFileSync(result.file, 'utf8'))), []);
    assert.deepEqual(receipts.map((result) => result.receipt.operation), ['preflight', 'deploy', 'status', 'verify', 'preflight', 'promote']);
  } finally { f.cleanup(); }
});

test('failed verification blocks promotion and production authorization fails closed with receipts', () => {
  const f = fixture(); try {
    const failing = path.join(f.root, 'bin', 'verify-fail'); writeFileSync(failing, '#!/bin/sh\nexit 9\n'); chmodSync(failing, 0o755);
    const cfg = { layout: { ...f.layout, state: path.join(f.root, '.aidlc/state') }, deployment: {
      preflight: [f.adapter], deploy: [f.adapter], verify: [failing], promote: [f.adapter], rollback: [f.adapter],
      production_requires_approval: true, production_allowed_risks: ['low', 'standard', 'critical'], critical_approvals: 2, require_preflight: true,
    } };
    deploy(cfg, 'preflight', 'staging', { artifact: A }); deploy(cfg, 'deploy', 'staging', { artifact: A });
    const verification = deploy(cfg, 'verify', 'staging', { artifact: A }); assert.equal(verification.ok, false);
    deploy(cfg, 'preflight', 'production', { artifact: A });
    assert.throws(() => deploy(cfg, 'promote', 'production', { artifact: A, approval: 'CAB-1' }), /no successful latest verification/);
    const denied = readdirSync(f.layout.deployment).map((name) => JSON.parse(readFileSync(path.join(f.layout.deployment, name), 'utf8'))).find((value) => value.operation === 'promote' && value.status === 'denied');
    assert.ok(denied); assert.deepEqual(validateDeploymentReceipt(denied), []);
  } finally { f.cleanup(); }
});

test('critical production promotion requires two approvals and rollback restores recorded digest', () => {
  const f = fixture(); try {
    const cfg = { layout: { ...f.layout, state: path.join(f.root, '.aidlc/state') }, deployment: {
      preflight: [f.adapter], deploy: [f.adapter], verify: [f.adapter], promote: [f.adapter], rollback: [f.adapter],
      production_requires_approval: true, production_allowed_risks: ['low', 'standard', 'critical'], critical_approvals: 2, require_preflight: true,
    } };
    deploy(cfg, 'preflight', 'staging', { artifact: A }); deploy(cfg, 'deploy', 'staging', { artifact: A }); deploy(cfg, 'verify', 'staging', { artifact: A });
    deploy(cfg, 'preflight', 'production', { artifact: A });
    assert.throws(() => deploy(cfg, 'promote', 'production', { artifact: A, risk: 'critical', approval: 'CAB-1' }), /2 independent approvals/);
    deploy(cfg, 'promote', 'production', { artifact: A, risk: 'critical', approval: 'CAB-1,CAB-2' });
    deploy(cfg, 'preflight', 'staging', { artifact: B }); deploy(cfg, 'deploy', 'staging', { artifact: B });
    const rolled = deploy(cfg, 'rollback', 'staging'); assert.equal(rolled.receipt.artifact_digest, A);
  } finally { f.cleanup(); }
});

test('monitoring is deterministic and a breach creates linked incident and intent', () => {
  const f = fixture(); try {
    const cfg = { layout: f.layout };
    assert.equal(breachedBands({ bands: [{ metric: 'error-rate', observed: 0.01, max: 0.05 }] }).length, 0);
    const result = closeLoop(cfg, 'error-rate-breach', { owner: 'payments', bands: [{ metric: 'error-rate', observed: 0.12, max: 0.05, source: 'synthetic-test' }] }, { now: new Date('2026-01-01T00:00:00Z') });
    assert.equal(result.breached, true); assert.equal(result.files.length, 2);
    assert.match(readFileSync(f.layout.incident + '/error-rate-breach.md', 'utf8'), /synthetic-test/);
    assert.match(readFileSync(f.layout.intent + '/error-rate-breach.md', 'utf8'), /monitoring-adapter/);
    assert.throws(() => closeLoop(cfg, 'error-rate-breach', { bands: [{ metric: 'x', observed: 2, max: 1 }] }), /already exists/);
  } finally { f.cleanup(); }
});

test('detect is a no-op when monitoring is not configured', () => {
  const f = fixture(); try {
    const result = detect({ layout: f.layout, monitoring: { collect: [] } });
    assert.equal(result.configured, false);
    assert.equal(result.breached, false);
    assert.equal(result.files.length, 0);
  } finally { f.cleanup(); }
});

test('detect --file writes incident and intent once, then reports already open', () => {
  const f = fixture(); try {
    const bands = path.join(f.root, 'bands.json');
    writeFileSync(bands, JSON.stringify({ owner: 'payments', bands: [{ metric: 'error-rate', observed: 0.12, max: 0.05, source: 'synthetic-test' }] }));
    const first = detect({ layout: f.layout, monitoring: { collect: [] } }, { file: bands, slug: 'error-rate', now: new Date('2026-01-01T00:00:00Z') });
    assert.equal(first.configured, true);
    assert.equal(first.breached, true);
    assert.equal(first.already_open, false);
    assert.equal(first.files.length, 2);
    const second = detect({ layout: f.layout, monitoring: { collect: [] } }, { file: bands, slug: 'error-rate' });
    assert.equal(second.already_open, true);
    assert.equal(second.files.length, 0);
  } finally { f.cleanup(); }
});

test('1σ logs and 2σ writes incident only; 3σ still opens intent', () => {
  const f = fixture(); try {
    const one = path.join(f.root, 'one.json');
    writeFileSync(one, JSON.stringify({ bands: [{ metric: 'error-rate', observed: 0.22, mean: 0.1, stdev: 0.1, source: 'sigma' }] }));
    const t1 = detect({ layout: f.layout, monitoring: { collect: [] } }, { file: one, slug: 'one-sigma' });
    assert.equal(t1.tier, 1);
    assert.equal(t1.breached, false);
    assert.equal(existsSync(path.join(f.layout.incident, 'one-sigma.md')), false);
    const two = path.join(f.root, 'two.json');
    writeFileSync(two, JSON.stringify({ bands: [{ metric: 'error-rate', observed: 0.32, mean: 0.1, stdev: 0.1, source: 'sigma' }] }));
    const t2 = detect({ layout: f.layout, monitoring: { collect: [] } }, { file: two, slug: 'two-sigma', now: new Date('2026-01-01T00:00:00Z') });
    assert.equal(t2.tier, 2);
    assert.equal(t2.diagnose, true);
    assert.equal(t2.files.length, 1);
    assert.equal(existsSync(path.join(f.layout.intent, 'two-sigma.md')), false);
    const three = path.join(f.root, 'three.json');
    writeFileSync(three, JSON.stringify({ bands: [{ metric: 'error-rate', observed: 0.5, mean: 0.1, stdev: 0.1, source: 'sigma' }] }));
    const t3 = detect({ layout: f.layout, monitoring: { collect: [] } }, { file: three, slug: 'three-sigma', now: new Date('2026-01-01T00:00:00Z') });
    assert.equal(t3.tier, 3);
    assert.equal(t3.files.length, 2);
    assert.equal(t3.rolled_back, false);
  } finally { f.cleanup(); }
});

test('3σ with rollback configured runs staging once and never production', () => {
  const f = fixture(); try {
    const log = path.join(f.root, 'rollback.log');
    writeFileSync(f.adapter, `#!/bin/sh\nprintf '%s %s\\n' "$1" "$HARNESS_ENVIRONMENT" >> '${log}'\nprintf "environment=%s\\n" "$1"\n`);
    chmodSync(f.adapter, 0o755);
    const cfg = {
      layout: f.layout,
      monitoring: { collect: [] },
      deployment: { rollback: [f.adapter], production_requires_approval: true },
    };
    const bands = path.join(f.root, 'three.json');
    writeFileSync(bands, JSON.stringify({ bands: [{ metric: 'error-rate', observed: 0.5, mean: 0.1, stdev: 0.1, source: 'sigma' }] }));
    const first = detect(cfg, { file: bands, slug: 'three-sigma', now: new Date('2026-01-01T00:00:00Z') });
    assert.equal(first.tier, 3);
    assert.equal(first.rolled_back, true);
    assert.equal(first.already_open, false);
    assert.match(first.rollback.receipt.stdout, /environment=staging/);
    assert.equal(existsSync(first.rollback.file), true);
    const lines = readFileSync(log, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^staging /);
    assert.doesNotMatch(readFileSync(log, 'utf8'), /production/);
    const second = detect(cfg, { file: bands, slug: 'three-sigma' });
    assert.equal(second.already_open, true);
    assert.equal(second.rolled_back, false);
    assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 1);
  } finally { f.cleanup(); }
});

test('a failed staging rollback keeps the incident and intent', () => {
  const f = fixture(); try {
    writeFileSync(f.adapter, '#!/bin/sh\nexit 1\n');
    chmodSync(f.adapter, 0o755);
    const cfg = {
      layout: f.layout,
      monitoring: { collect: [] },
      deployment: { rollback: [f.adapter], production_requires_approval: true },
    };
    const bands = path.join(f.root, 'three.json');
    writeFileSync(bands, JSON.stringify({ bands: [{ metric: 'error-rate', observed: 0.5, mean: 0.1, stdev: 0.1 }] }));
    const result = detect(cfg, { file: bands, slug: 'three-sigma', now: new Date('2026-01-01T00:00:00Z') });
    assert.equal(result.rolled_back, false);
    assert.equal(result.files.length, 2);
    assert.equal(existsSync(path.join(f.layout.incident, 'three-sigma.md')), true);
    assert.equal(existsSync(path.join(f.layout.intent, 'three-sigma.md')), true);
  } finally { f.cleanup(); }
});

test('detect runs a collect argv and parses the bands document from stdout', () => {
  const f = fixture(); try {
    const collector = path.join(f.root, 'bin', 'collect');
    writeFileSync(collector, '#!/bin/sh\nprintf \'{"bands":[{"metric":"error-rate","observed":0.9,"max":0.1,"source":"argv"}]}\'\n');
    chmodSync(collector, 0o755);
    const result = detect({ layout: f.layout, monitoring: { collect: [collector] } }, { slug: 'error-rate', now: new Date('2026-01-01T00:00:00Z') });
    assert.equal(result.breached, true);
    assert.match(readFileSync(path.join(f.layout.incident, 'error-rate.md'), 'utf8'), /argv/);
  } finally { f.cleanup(); }
});
