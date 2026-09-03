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

// A run is a session, and `report().runs` is the denominator behind KILL.min_sessions. runId()
// above only ever *creates* an id, so without a rotation point the file written on the first
// invocation is the run id forever: this repo accumulated 1,185 rows over eight days under a
// single id, which left every control sitting at `insufficient-data` and made `ledger audit` —
// the only query that authorises deleting a control — unable to return a verdict.
//
// HARNESS_RUN_ID still wins, so CI can pin one run across several steps.
export function newRun(L = layout()) {
  if (process.env.HARNESS_RUN_ID) return process.env.HARNESS_RUN_ID;
  mkdirSync(L.state, { recursive: true });
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
// Controls reached by a hook binding rather than a stage. They are wired — the ledger sees them
// more often than anything else — they are just not named in `[stages]`. Judging reachability by
// stages alone condemned the three busiest controls in the repository.
const HOOK_CONTROLS = ['bash-guard', 'write-guard', 'graph-refresh'];

// What actually runs. A control reachable from neither a stage nor a hook never executes during a
// check, so the ledger sees a stray invocation or two and advises "wait for fifty" forever.
export function wiredControls(cfg) {
  const stages = cfg?.stages ?? {};
  const seen = new Set(HOOK_CONTROLS);
  const walk = (name, depth = 0) => {
    if (depth > 8) return;
    for (const entry of stages[name] ?? []) {
      if (stages[entry]) walk(entry, depth + 1); else seen.add(entry);
    }
  };
  for (const name of Object.keys(stages)) walk(name);
  return seen;
}

// B9. Mark the most recent unflagged fires of a rule as false blocks. Rewriting a ledger line is
// not something to do casually, so this only ever sets the flag a human asked for, never a
// verdict, a timestamp or a rule — the record of what fired stays exactly as the guard wrote it.
export function flag(L = layout(), { rule, run = null, value = true } = {}) {
  if (!existsSync(L.ledger)) return 0;
  const lines = readFileSync(L.ledger, 'utf8').split('\n');
  let marked = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]) continue;
    let row; try { row = JSON.parse(lines[i]); } catch { continue; }
    if (row.rule !== rule || row.verdict !== 'fail') continue;
    if (run && row.run !== run) continue;
    if (row.false === value) continue;
    lines[i] = JSON.stringify({ ...row, false: value });
    marked++;
    if (!run) break; // no --run: the one just recorded, which is the one the human just hit
  }
  if (marked) writeFileSync(L.ledger, lines.join('\n'));
  return marked;
}

export function report(L = layout(), { days = 30, staged = null } = {}) {
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
    // lean-v2 B9. Which rule fired, and how often a human called that fire wrong. A control's
    // fire rate says how busy it is; only this says whether being busy was useful. `bash-guard`
    // stood at 275 denials with no way to separate a caught mistake from a refusal to write a
    // commit message, and its verdict — "17.7% fired, keep" — was a guess in both directions.
    if (r.verdict === 'fail' && r.rule) {
      const rules = (c.rules ??= new Map());
      const entry = rules.get(r.rule) ?? { rule: r.rule, fired: 0, false: 0 };
      entry.fired++;
      if (r.false === true) entry.false++;
      rules.set(r.rule, entry);
    }
    by.set(k, c);
  }
  const controls = [...by.values()].map((c) => ({
    ...c,
    // A rule whose fires are more than half called false is noise wearing a control's badge.
    rules: [...(c.rules?.values() ?? [])]
      .map((entry) => ({ ...entry, noisy: entry.fired >= 3 && entry.false / entry.fired > 0.5 }))
      .sort((a, b) => b.fired - a.fired),
    fire_rate: c.invocations ? c.fired / c.invocations : 0,
    avg_ms: c.invocations ? Math.round(c.ms / c.invocations) : 0,
    // Law 10 kill criterion, computed rather than argued about — but only over what the ledger
    // can actually see. It cannot see a control no stage runs, and it cannot tell a deterrent
    // from a corpse: `budget` had 56 invocations and zero fires because the repository sat at
    // exactly its limits and nobody tried to add an eleventh skill. Both look like "0% fired".
    verdict: staged && !staged.has(c.control) ? 'unwired'
      : c.invocations < KILL.min_sessions ? 'insufficient-data'
        : c.errored / c.invocations > KILL.max_error_rate ? 'unreliable'
          : c.fired === 0 ? 'never-fired'
            : c.fired / c.invocations < KILL.min_fire_rate ? 'rarely-fires'
              : 'earning-its-place',
  })).sort((a, b) => b.invocations - a.invocations);
  return { days, runs, rows: rows.length, controls };
}

// The monthly audit. Turns the ledger into a list of decisions a person can act on in minutes,
// which is the only reason any of this instrumentation exists.
export function audit(L = layout(), { days = 30, staged = null } = {}) {
  const r = report(L, { days, staged });
  const action = {
    'earning-its-place': 'keep',
    'rarely-fires': 'review — does it catch anything the eval suite would miss?',
    'never-fired': 'decide — a limit nobody crossed looks exactly like a control that checks nothing; read its why: before deleting it',
    unwired: 'decide — no stage runs it, so the ledger cannot judge it: wire it into a stage or remove it',
    unreliable: 'FIX OR DELETE — errors too often to be trusted',
    'insufficient-data': `wait — ${KILL.min_sessions} invocations needed`,
  };
  const controls = r.controls.map((c) => ({ ...c, action: action[c.verdict] }));
  return {
    ...r,
    thresholds: KILL,
    controls,
    // What the ledger can justify removing on its own evidence, and nothing else. It used to put
    // every zero-fire control here; asked for the first time with enough evidence to answer, it
    // named `budget` — a deterrent standing at its limit — and deleting it would have removed the
    // reason the limit was never crossed.
    deletions: controls.filter((c) => c.verdict === 'unreliable').map((c) => c.control),
    // Real questions, for a person holding the control's `why:`.
    decide: controls.filter((c) => c.verdict === 'never-fired' || c.verdict === 'unwired').map((c) => c.control),
    // B9: rules a human has called wrong more often than right. Not a deletion — a rule that
    // blocks the wrong thing usually needs narrowing, which is what happened to the four rules
    // repaired so far. But it is a question the ledger could not previously ask at all.
    noisy: controls.flatMap((c) => (c.rules ?? []).filter((r) => r.noisy).map((r) => `${c.control}/${r.rule}`)),
    ready: r.controls.every((c) => c.verdict !== 'insufficient-data'),
  };
}
