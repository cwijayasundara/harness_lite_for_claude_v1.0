// Law 4: the ledger is control #1.
//
// Every check invocation appends a row, on every run, from the very first commit of this
// repository. v6's removal mechanism required >=20 recorded outcomes and had 0, because the
// ledger was opt-in telemetry added late. This one is not optional and has no configuration.

import { appendFileSync, mkdirSync, readFileSync, existsSync, writeFileSync, lstatSync } from 'node:fs';
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
const HOOK_CONTROLS = ['bash-guard', 'write-guard', 'map-drift', 'stop-guard'];

// every-control-fires-or-goes B3. Rows that exist so a failure is visible, not so a verdict can
// be reached: `graph-refresh` has no defect to fire on, and judging it produced a permanent
// "decide" nobody could decide. Its errors are read from `staleSince`, not from here.
const TELEMETRY = new Set(['graph-refresh']);

// B4. A name no stage, hook or deterrent entry reaches, and nothing has recorded for this long,
// is a deleted control's afterlife in the ledger — listed once, never asked about.
const RETIRED_AFTER_MS = 7 * 864e5;

// B1. A control that never fired is a deterrent or a corpse. `[deterrents]` in harness.toml
// names the test that plants the defect its why: describes; a file that exists and names the
// control is proof, and anything less leaves `never-fired` standing.
function provenBy(control, deterrents, root, warnings) {
  const file = deterrents?.[control];
  if (!file) return null;
  const abs = root ? path.join(root, file) : file;
  if (!existsSync(abs)) { warnings.push(`${control}: [deterrents] names ${file}, which does not exist`); return null; }
  if (!readFileSync(abs, 'utf8').includes(control)) { warnings.push(`${control}: [deterrents] names ${file}, which never mentions ${control}`); return null; }
  return file;
}

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

export function report(L = layout(), { days = 30, staged = null, deterrents = null, root = null } = {}) {
  const now = Date.now();
  const since = now - days * 864e5;
  const rows = read(L).filter((r) => Date.parse(r.ts) >= since && r.kind !== 'check-invocation' && !TELEMETRY.has(r.control));
  const runs = new Set(rows.map((r) => r.run)).size;
  const warnings = [];
  const by = new Map();
  for (const r of rows) {
    const k = r.control;
    const c = by.get(k) ?? { control: k, invocations: 0, fired: 0, errored: 0, skipped: 0, findings: 0, ms: 0, last: 0 };
    c.invocations++;
    c.last = Math.max(c.last, Date.parse(r.ts) || 0);
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
  const reachable = (c) => !staged || staged.has(c.control) || !!deterrents?.[c.control];
  const retired = [...by.values()].filter((c) => !reachable(c) && now - c.last > RETIRED_AFTER_MS).map((c) => c.control);
  const controls = [...by.values()].filter((c) => !retired.includes(c.control)).map((c) => ({
    ...c,
    proof: c.fired === 0 && c.invocations >= KILL.min_sessions ? provenBy(c.control, deterrents, root, warnings) : null,
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
          : c.fired === 0 ? (provenBy(c.control, deterrents, root, []) ? 'deterrent' : 'never-fired')
            : c.fired / c.invocations < KILL.min_fire_rate ? 'rarely-fires'
              : 'earning-its-place',
  })).sort((a, b) => b.invocations - a.invocations);
  return { days, runs, rows: rows.length, controls, retired, warnings };
}

// The monthly audit. Turns the ledger into a list of decisions a person can act on in minutes,
// which is the only reason any of this instrumentation exists.
export function audit(L = layout(), { days = 30, staged = null, deterrents = null, root = null } = {}) {
  const r = report(L, { days, staged, deterrents, root });
  const action = {
    'earning-its-place': 'keep',
    'rarely-fires': 'review — does it catch anything the eval suite would miss?',
    'never-fired': 'decide — a limit nobody crossed looks exactly like a control that checks nothing; read its why: before deleting it',
    unwired: 'decide — no stage runs it, so the ledger cannot judge it: wire it into a stage or remove it',
    unreliable: 'FIX OR DELETE — errors too often to be trusted',
    'insufficient-data': `wait — ${KILL.min_sessions} invocations needed`,
  };
  const controls = r.controls.map((c) => ({ ...c, action: c.verdict === 'deterrent' ? `keep — proven by ${c.proof}` : action[c.verdict] }));
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

// Export observations from their original invocation, never from the exporter's environment.
function exportText(L, file) {
  const rel = path.relative(L.root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('unsafe export path');
  let current = L.root;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error('symlink in export evidence');
  }
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('evidence exceeds export bound; archive older evidence first');
  return readFileSync(file, 'utf8');
}
export function exportInvocation(L, invocation) {
  if (typeof invocation !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(invocation)) throw new Error('invalid invocation ID');
  if (!existsSync(L.ledger)) throw new Error('invocation not found');
  const raw = exportText(L, L.ledger);
  if (Buffer.byteLength(raw) > 32 * 1024 * 1024) throw new Error('ledger exceeds export bound; archive older evidence first');
  const rows = raw.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { throw new Error('malformed ledger evidence; export refused'); }
  }).filter(row => row?.provenance?.invocation === invocation);
  if (!rows.length) throw new Error('invocation not found (legacy rows have no invocation identity)');
  const summary = rows.filter(row => row.kind === 'check-invocation');
  const controls = rows.filter(row => row.kind !== 'check-invocation');
  const p = summary[0]?.provenance;
  const validActor = p?.actor && p.actor.authenticated === false && ['explicit-label', 'ci-environment-assertion', 'unknown'].includes(p.actor.provenance) && (p.actor.provenance === 'unknown' ? p.actor.label === null : typeof p.actor.label === 'string' && p.actor.label.length > 0 && p.actor.label.length <= 200 && !/[\x00-\x1f\x7f]/.test(p.actor.label));
  if (!validActor || !['verified', 'development', 'unverified', 'mismatch'].includes(p?.runtime?.status) || !['committed', 'dirty', 'unavailable'].includes(p?.policy?.state) || typeof p?.consistent !== 'boolean' || summary.length !== 1 || !p || p.version !== 1 || p.trust !== 'unsigned-local-observation' || !p.actor || !p.runtime || !p.policy || !p.repository || !Number.isFinite(Date.parse(p.at)) || typeof summary[0].ok !== 'boolean' || summary[0].controls_count !== controls.length || rows.some(r => JSON.stringify(r.provenance) !== JSON.stringify(p) || r.stage !== summary[0].stage || JSON.stringify(r.revision) !== JSON.stringify(summary[0].revision)) || controls.some(r => !['pass', 'fail', 'skipped', 'errored'].includes(r.verdict) || typeof r.control !== 'string')) throw new Error('malformed or inconsistent invocation evidence');
  let report = null, reportState = 'unavailable';
  if (existsSync(L.lastCheck)) {
    let last; try { last = JSON.parse(exportText(L, L.lastCheck)); } catch { throw new Error('malformed last-check evidence'); }
    if (last.provenance?.invocation === invocation) {
      if (JSON.stringify(last.provenance) !== JSON.stringify(p) || last.stage !== summary[0].stage || last.ok !== summary[0].ok || JSON.stringify(last.identity_errors) !== JSON.stringify(summary[0].identity_errors) || JSON.stringify(last.revision) !== JSON.stringify(summary[0].revision) || !Array.isArray(last.controls) || last.controls.length !== controls.length || last.controls.some((r, i) => r.control !== controls[i].control || r.verdict !== controls[i].verdict || r.ms !== controls[i].ms)) throw new Error('inconsistent last-check evidence');
      report = last; reportState = 'available';
    }
  }
  return { version: 1, trust: 'unsigned-local-observation', invocation, provenance: p, summary: summary[0], controls, report_state: reportState, report };
}
