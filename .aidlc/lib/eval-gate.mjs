// The eval suite is the harness's specification, and until this file existed nothing compared
// one run to the last. 303b58b changed 242 files and renamed five tasks seven days after the
// last graded run; the score on the status board never moved, because an aggregate cannot see a
// substitution. This grades task by task, and it fails closed.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadResults, verdicts } from './indicators.mjs';

// Re-exported, not redefined: callers keep one entry point and there stays one implementation of
// which results count.
export { loadResults };

export const RECORD_SCHEMA = 'aidlc.eval-expectation/v2';
const RECORD_SCHEMA_V1 = 'aidlc.eval-expectation/v1';

// How far a task may drift before it is a finding. Wide on purpose: identical work has been
// measured between 0.858 and 1.208, and a bound inside the noise fires on nothing real and gets
// ignored — which is worse than no bound. The floor it multiplies only ever falls, so this
// tolerates noise without tolerating a trend.
export const COST_TOLERANCE = 1.5;

// A v1 entry is a bare verdict string; a v2 entry is { verdict, usd }. Reading both means an
// older record loads rather than erroring, and simply has no floor until the next --update.
const entry = (value) => (typeof value === 'string' ? { verdict: value, usd: null } : { verdict: value?.verdict ?? null, usd: value?.usd ?? null });

// run.mjs: "Flaky is not green. A suite that rounds 2-of-3 up is a suite that stops detecting
// drift." Only `pass` is a pass here too.
const passed = (verdict) => verdict === 'pass';

export function readRecord(file) {
  if (!existsSync(file)) return null;
  const body = JSON.parse(readFileSync(file, 'utf8'));
  if (body?.schema !== RECORD_SCHEMA && body?.schema !== RECORD_SCHEMA_V1) throw new Error(`${file}: schema must be ${RECORD_SCHEMA}`);
  if (!body.tasks || typeof body.tasks !== 'object') throw new Error(`${file}: tasks must be an object`);
  return body;
}

// Everything that is not "the recorded set graded exactly as recorded, or better" is a finding.
// Missing and unrecorded are findings rather than warnings on purpose: a task renamed without
// being re-recorded is invisible to any check that only walks the intersection.
export function gate(results, record) {
  if (!results) return { ok: false, reason: 'no eval results found — run `node evals/run.mjs` first', regressed: [], improved: [], missing: [], unrecorded: [], costly: [] };
  if (!record) return { ok: false, reason: 'no expectation record — run `harness evals gate --update` after a full run', regressed: [], improved: [], missing: [], unrecorded: [], costly: [] };

  const graded = verdicts(results);
  const spend = new Map((results.results ?? []).map((r) => [r.id, r.usd]));
  const regressed = [];
  const improved = [];
  const missing = [];
  const costly = [];

  for (const [id, expected] of Object.entries(record.tasks)) {
    if (!graded.has(id)) { missing.push(id); continue; }
    const actual = graded.get(id);
    const { verdict, usd: floor } = entry(expected);
    if (passed(verdict) && !passed(actual)) regressed.push({ id, expected: verdict, actual });
    else if (!passed(verdict) && passed(actual)) improved.push({ id, expected: verdict, actual });

    // Cost is not a verdict. A task that behaves correctly and costs too much has one problem,
    // and the report says which.
    const observed = spend.get(id);
    if (floor != null && observed != null && observed > floor * COST_TOLERANCE) {
      costly.push({ id, floor, observed, tolerance: COST_TOLERANCE });
    }
  }
  const unrecorded = [...graded.keys()].filter((id) => !(id in record.tasks));

  return {
    ok: !regressed.length && !missing.length && !unrecorded.length && !costly.length,
    reason: null,
    source: results.source ?? null,
    sources: results.sources ?? (results.source ? [results.source] : []),
    regressed, improved, missing, unrecorded, costly,
  };
}

// Raise-only. There is no flag that lowers a recorded task: lowering is a hand edit to a
// committed file, which a human reviews. A baseline you can lower to make a run green is the
// same defect as a fixture edited to make a test pass, and evals/fixtures/ is write-protected
// for exactly that reason.
export function update(record, results, { commit = null, at = new Date().toISOString() } = {}) {
  const graded = verdicts(results);

  // A task nobody could grade has no state to record. Writing `inconclusive` into the record
  // would make the next run's comparison meaningless in both directions.
  const ungraded = [...graded.entries()].filter(([, v]) => v === 'inconclusive').map(([id]) => id);
  if (ungraded.length) throw new Error(`refusing to record ${ungraded.join(', ')} — inconclusive; re-run those tasks first`);

  const previous = record?.tasks ?? {};
  const lowered = Object.entries(previous).filter(([id, expected]) => passed(entry(expected).verdict) && !passed(graded.get(id)));
  if (lowered.length) throw new Error(`refusing to lower ${lowered.map(([id]) => id).join(', ')} — the record only moves fail -> pass`);

  // The cost floor falls only. Recording the latest observed figure would let a floor climb step
  // by step: every stage of budget-forces-deletion's rise from 0.184 to 0.991 was small against
  // the one before it, and a floor that follows the last run cannot see a trend.
  const spend = new Map((results.results ?? []).map((r) => [r.id, r.usd]));
  const tasks = {};
  for (const id of [...graded.keys()].sort()) {
    const was = entry(previous[id]).usd;
    const now = spend.get(id) ?? null;
    const usd = was == null ? now : now == null ? was : Math.min(was, now);
    tasks[id] = { verdict: graded.get(id), usd };
  }
  // `sources` oldest first, so a reader can see which run supplied a corrected verdict. A record
  // assembled from several runs without saying so would be worse than one that is merely stale.
  return { schema: RECORD_SCHEMA, recorded_at: at, source: results.source ?? null, sources: results.sources ?? (results.source ? [results.source] : []), commit, tasks };
}

export function writeRecord(file, record) {
  writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  return file;
}


export function render(result) {
  const lines = [];
  if (result.reason) return [`FAIL  evals  ${result.reason}`];
  lines.push(`evals gate · ${result.source}${result.sources?.length > 1 ? ` (+${result.sources.length - 1} correcting run${result.sources.length > 2 ? 's' : ''})` : ''}`);
  for (const r of result.regressed) lines.push(`  REGRESSED   ${r.id}  recorded ${r.expected}, now ${r.actual}`);
  for (const id of result.missing) lines.push(`  MISSING     ${id}  recorded but not graded in this run`);
  for (const id of result.unrecorded) lines.push(`  UNRECORDED  ${id}  graded but absent from the record`);
  for (const c of result.costly ?? []) lines.push(`  COSTLY      ${c.id}  ${c.observed.toFixed(3)} against a floor of ${c.floor.toFixed(3)} (over ${c.tolerance}x) — behaviour is fine, the price is not`);
  for (const r of result.improved) lines.push(`  improved    ${r.id}  recorded ${r.expected}, now ${r.actual} — rerun with --update to hold it`);
  lines.push(result.ok ? 'PASS  evals  no task lost ground' : (result.regressed.length || result.missing.length || result.unrecorded.length) ? 'FAIL  evals  the record and this run disagree' : 'FAIL  evals  every task behaved, but the suite got more expensive');
  return lines;
}
