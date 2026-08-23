// Law 4: the ledger is control #1.
//
// Every check invocation appends a row, on every run, from the very first commit of this
// repository. v6's removal mechanism required >=20 recorded outcomes and had 0, because the
// ledger was opt-in telemetry added late. This one is not optional and has no configuration.

import { appendFileSync, mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { layout } from './paths.mjs';

export function runId(L = layout()) {
  mkdirSync(L.state, { recursive: true });
  if (process.env.HARNESS_RUN_ID) return process.env.HARNESS_RUN_ID;
  if (existsSync(L.runId)) return readFileSync(L.runId, 'utf8').trim();
  const id = randomUUID().slice(0, 8);
  writeFileSync(L.runId, id);
  return id;
}

export function append(row, L = layout()) {
  try {
    mkdirSync(path.dirname(L.ledger), { recursive: true });
    appendFileSync(L.ledger, JSON.stringify({ ts: new Date().toISOString(), run: runId(L), ...row }) + '\n');
  } catch { /* Law 10: fail open — but see errored() below, which is how we find out. */ }
}

// A control that throws is NOT a control that passed. v6 wrapped every hook in
// catch(_){exit(0)} with no counter, so a broken guard was indistinguishable from a clean run.
export function errored(control, stage, message, L = layout()) {
  append({ stage, control, verdict: 'errored', ms: 0, findings: 0, error: String(message).slice(0, 400) }, L);
}

export function read(L = layout()) {
  if (!existsSync(L.ledger)) return [];
  return readFileSync(L.ledger, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// The subtractive half of the loop. This is the query that authorises deleting a control.
export function report(L = layout(), { days = 30 } = {}) {
  const since = Date.now() - days * 864e5;
  const rows = read(L).filter((r) => Date.parse(r.ts) >= since);
  const runs = new Set(rows.map((r) => r.run)).size;
  const by = new Map();
  for (const r of rows) {
    const k = r.control;
    const c = by.get(k) ?? { control: k, invocations: 0, fired: 0, errored: 0, skipped: 0, findings: 0, ms: 0 };
    c.invocations++;
    if (r.verdict === 'fail') c.fired++;
    if (r.verdict === 'errored') c.errored++;
    if (r.verdict === 'skipped') c.skipped++;
    c.findings += r.findings ?? 0;
    c.ms += r.ms ?? 0;
    by.set(k, c);
  }
  const controls = [...by.values()].map((c) => ({
    ...c,
    fire_rate: c.invocations ? c.fired / c.invocations : 0,
    avg_ms: c.invocations ? Math.round(c.ms / c.invocations) : 0,
    // Law 10 kill criterion, computed rather than argued about.
    verdict: c.invocations < 50 ? 'insufficient-data'
      : c.errored / c.invocations > 0.1 ? 'unreliable'
      : c.fired === 0 ? 'candidate-for-deletion' : 'earning-its-place',
  })).sort((a, b) => b.invocations - a.invocations);
  return { days, runs, rows: rows.length, controls };
}
