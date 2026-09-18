import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { layout } from '../.claude/harness/lib/paths.mjs';
import { SCHEMA, validateEvent, parseEvents, ingest, readEvents, exportEvents, summarize } from '../.claude/harness/lib/productivity.mjs';

const event = (overrides = {}) => ({
  schema: SCHEMA, id: 'ci-1', change: 'checkout', stage: 'ci', event: 'completed',
  at: '2026-09-18T10:00:00Z', actor_type: 'ci', result: 'pass', candidate: 'abc123',
  duration_ms: 1000, first_pass: true, cost_usd: 0.25, ...overrides,
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'productivity-'));
  const cfg = { layout: layout(root) };
  mkdirSync(cfg.layout.state, { recursive: true });
  return { root, cfg, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('the shared schema validates stage-specific evidence without inventing missing values', () => {
  assert.deepEqual(validateEvent(event()), []);
  assert.match(validateEvent(event({ candidate: undefined })).join('; '), /ci events require candidate/);
  assert.match(validateEvent(event({ stage: 'review', findings: 2, resolver_type: undefined })).join('; '), /resolver_type/);
  assert.match(validateEvent(event({ stage: 'deploy' })).join('; '), /deploy events require/);
  assert.match(validateEvent(event({ stage: 'incident' })).join('; '), /incident events require/);
  assert.throws(() => parseEvents('{bad'), /JSON array\/object or JSONL/);
});

test('ingestion is append-only, validates the whole batch and rejects duplicate identities', () => {
  const f = fixture();
  try {
    const source = path.join(f.root, 'events.json');
    writeFileSync(source, JSON.stringify([event(), event({ id: 'human-1', actor_type: 'human', stage: 'review', resolver_type: 'human', findings: 1, active_minutes: 12 })]));
    assert.deepEqual(ingest(f.cfg, source).imported, 2);
    assert.equal(readEvents(f.cfg).length, 2);
    assert.throws(() => ingest(f.cfg, source), /duplicate productivity event id/);
    assert.equal(readEvents(f.cfg).length, 2, 'a rejected batch changed the event store');
  } finally { f.cleanup(); }
});

test('summary reports distributions, costs and quality outcomes from observed evidence', () => {
  const events = [
    ...[10, 20, 30, 40, 50].map((duration_ms, i) => event({ id: `ci-${i}`, change: `c${i}`, duration_ms, first_pass: i !== 1, result: i === 1 ? 'fail' : 'pass', cost_usd: 1 })),
    ...[5, 10, 15, 20, 25].map((active_minutes, i) => event({ id: `human-${i}`, change: `c${i}`, stage: 'review', actor_type: 'human', resolver_type: 'human', findings: i, active_minutes, duration_ms: undefined, cost_usd: 0 })),
    ...[0, 1, 2, 3].map((i) => event({ id: `deploy-ok-${i}`, stage: 'deploy', event: 'healthy', change: `c${i}`, release: `r${i}`, environment: 'prod', artifact: `image@sha256:${i}`, duration_ms: undefined, cost_usd: 0 })),
    event({ id: 'deploy-fail', stage: 'deploy', event: 'completed', change: 'search', release: 'r2', environment: 'prod', artifact: 'image@sha256:b', result: 'rolled-back', duration_ms: undefined, cost_usd: 0 }),
  ];
  const result = summarize(events);
  assert.deepEqual(result.elapsed_ms, { value: 30, p75: 40, p90: 50, unit: 'ms', of: 5 });
  assert.equal(result.human_active_minutes.value, 15);
  assert.equal(result.first_pass_ci.value, 0.8);
  assert.equal(result.change_failure_rate.value, 0.2);
  assert.equal(result.total_cost_usd.value, 5);
  assert.equal(result.total_cost_usd.of, 15);
  assert.equal(result.cost_per_accepted_change.value, 1.25);
  assert.equal(result.quality_adjusted_throughput.value, 3);
});

test('JSON and CSV exports are documented stable shapes and quote spreadsheet cells safely', () => {
  const events = [event({ source: 'GitHub, Actions' })];
  const json = JSON.parse(exportEvents(events, 'json'));
  assert.equal(json.schema, 'harness.productivity-export/v1');
  assert.equal(json.events[0].id, 'ci-1');
  const csv = exportEvents(events, 'csv');
  assert.match(csv, /^schema,id,change,/);
  assert.match(csv, /"GitHub, Actions"/);
  assert.throws(() => exportEvents(events, 'xml'), /json or csv/);
});
