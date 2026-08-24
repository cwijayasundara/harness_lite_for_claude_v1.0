import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deploy, closeLoop, breachedBands, detect } from '../lib/operations.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'operations-'));
  const artifacts = path.join(root, '.claude/artifacts');
  const layout = { root, deployment: path.join(artifacts, 'deployment'), incident: path.join(artifacts, 'incident'), intent: path.join(artifacts, 'intent') };
  mkdirSync(path.join(root, 'bin'), { recursive: true });
  const adapter = path.join(root, 'bin', 'adapter');
  writeFileSync(adapter, '#!/bin/sh\nprintf "environment=%s approval=%s\\n" "$1" "$HARNESS_RELEASE_APPROVAL"\n'); chmodSync(adapter, 0o755);
  return { root, layout, adapter, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('deployment adapter writes a durable receipt and gates production', () => {
  const f = fixture(); try {
    const cfg = { layout: f.layout, deployment: { deploy: [f.adapter], status: [f.adapter], rollback: [f.adapter], production_requires_approval: true } };
    assert.throws(() => deploy(cfg, 'deploy', 'production'), /requires --approval/);
    const result = deploy(cfg, 'deploy', 'production', { approval: 'CAB-42', now: new Date('2026-01-01T00:00:00Z') });
    assert.equal(result.ok, true); assert.ok(existsSync(result.file));
    const receipt = JSON.parse(readFileSync(result.file, 'utf8'));
    assert.equal(receipt.approval, 'CAB-42'); assert.match(receipt.stdout, /environment=production approval=CAB-42/);
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
