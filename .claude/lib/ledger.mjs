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

// Law 10's kill criteria, as thresholds in one place rather than judgement in many.
export const KILL = {
  min_sessions: 50,     // below this, no verdict is honest
  min_fire_rate: 0.05,  // fired on fewer than 1 in 20 invocations
  max_error_rate: 0.10, // errors more than a tenth of the time: unreliable, not useful
};

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
    verdict: c.invocations < KILL.min_sessions ? 'insufficient-data'
      : c.errored / c.invocations > KILL.max_error_rate ? 'unreliable'
      : c.fired === 0 ? 'candidate-for-deletion'
      : c.fired / c.invocations < KILL.min_fire_rate ? 'rarely-fires'
      : 'earning-its-place',
  })).sort((a, b) => b.invocations - a.invocations);
  return { days, runs, rows: rows.length, controls };
}

// The monthly audit. Turns the ledger into a list of decisions a person can act on in minutes,
// which is the only reason any of this instrumentation exists.
export function audit(L = layout(), { days = 30 } = {}) {
  const r = report(L, { days });
  const action = {
    'earning-its-place': 'keep',
    'rarely-fires': 'review — does it catch anything the eval suite would miss?',
    'candidate-for-deletion': 'DELETE — never fired; remove it and run the eval suite',
    unreliable: 'FIX OR DELETE — errors too often to be trusted',
    'insufficient-data': `wait — ${KILL.min_sessions} invocations needed`,
  };
  const controls = r.controls.map((c) => ({ ...c, action: action[c.verdict] }));
  return {
    ...r,
    thresholds: KILL,
    controls,
    // The one number the audit exists to produce.
    deletions: controls.filter((c) => c.verdict === 'candidate-for-deletion' || c.verdict === 'unreliable').map((c) => c.control),
    ready: r.controls.every((c) => c.verdict !== 'insufficient-data'),
  };
}
