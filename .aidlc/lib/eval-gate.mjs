// The eval suite is the harness's specification, and until this file existed nothing compared
// one run to the last. 303b58b changed 242 files and renamed five tasks seven days after the
// last graded run; the score on the status board never moved, because an aggregate cannot see a
// substitution. This grades task by task, and it fails closed.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The newest full run, and nothing else.
//
// lean-v2 cut 10 removed the overlay this replaced: a widest-run base that later narrow runs
// corrected task by task, with per-file provenance and an ordering rule. It existed so one
// inconclusive task could be re-graded for a dollar instead of thirteen. That is a real saving
// and it cost four contracts in two days, 150 lines and the largest test file in the repository,
// to grade a 22-task suite that CI did not run. With CI running the suite on every steering
// change, the cheap repair is to run it again.
//
// A full run is one that graded every task the record expects. A three-task smoke cannot become
// the baseline, which is the one property the overlay had that had to survive.
export function loadResults(dir, expectedIds = null) {
  if (!existsSync(dir)) return null;
  const runs = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    try {
      const body = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
      const results = body.results ?? [];
      if (!results.length) continue;
      runs.push({ source: name, body, ids: new Set(results.map((r) => r.id)) });
    } catch { /* skip unreadable result files */ }
  }
  if (!runs.length) return null;
  // Filenames are ISO timestamps, so sorting by name is sorting by time.
  runs.sort((a, b) => a.source.localeCompare(b.source));
  const full = expectedIds
    ? runs.filter((r) => [...expectedIds].every((id) => r.ids.has(id)))
    : runs.filter((r) => r.ids.size === Math.max(...runs.map((x) => x.ids.size)));
  const chosen = (full.length ? full : runs)[Math.max(full.length, runs.length) - 1] ?? runs[runs.length - 1];
  return { ...chosen.body, source: chosen.source, sources: [chosen.source] };
}

// id -> verdict, from a results file. Shared so the board and the gate cannot drift apart about
// what a run said.
export function verdicts(results) {
  return new Map((results?.results ?? []).map((r) => [r.id, r.verdict]));
}

export const RECORD_SCHEMA = 'aidlc.eval-expectation/v2';
const RECORD_SCHEMA_V1 = 'aidlc.eval-expectation/v1';

// lean-v2 cut 10 removed the per-task and suite cost ratchets. They compared each run against a
// recorded floor with a 1.5x per-task and 1.25x aggregate tolerance, and cost four contracts in
// two days to tune. The tolerances were wide because the measurements were noisy, and a bound
// inside the noise fires on nothing real. The replacement is one number a human set: a spend cap
// per CI run, which fails the job rather than negotiating with a floor.
//
// Per-task `usd` is still recorded by run.mjs and still written into the record, because cost per
// feature by model is what the example app has to report. It is data now, not a gate.
const totalOf = (results) => (results ?? []).reduce((sum, r) => sum + (r.usd ?? 0), 0) || null;

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
  if (!results) return { ok: false, reason: 'no eval results found — run `node evals/run.mjs` first', regressed: [], improved: [], missing: [], unrecorded: [] };
  if (!record) return { ok: false, reason: 'no expectation record — run `harness evals gate --update` after a full run', regressed: [], improved: [], missing: [], unrecorded: [] };

  const graded = verdicts(results);
  const regressed = [];
  const improved = [];
  const missing = [];

  for (const [id, expected] of Object.entries(record.tasks)) {
    if (!graded.has(id)) { missing.push(id); continue; }
    const actual = graded.get(id);
    const { verdict } = entry(expected);
    if (passed(verdict) && !passed(actual)) regressed.push({ id, expected: verdict, actual });
    else if (!passed(verdict) && passed(actual)) improved.push({ id, expected: verdict, actual });
  }
  const unrecorded = [...graded.keys()].filter((id) => !(id in record.tasks));

  return {
    ok: !regressed.length && !missing.length && !unrecorded.length,
    reason: null,
    source: results.source ?? null,
    sources: results.sources ?? (results.source ? [results.source] : []),
    regressed, improved, missing, unrecorded,
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

  // usd is recorded, not ratcheted: the newest observation, so a reader can see what a run costs
  // per task and per model. The gate no longer compares it against anything.
  const spend = new Map((results.results ?? []).map((r) => [r.id, r.usd]));
  const tasks = {};
  for (const id of [...graded.keys()].sort()) {
    tasks[id] = { verdict: graded.get(id), usd: spend.get(id) ?? entry(previous[id]).usd };
  }
  const usd_total = totalOf(results.results) ?? record?.usd_total ?? null;

  return { schema: RECORD_SCHEMA, recorded_at: at, usd_total, source: results.source ?? null, sources: results.sources ?? (results.source ? [results.source] : []), commit, tasks };
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
  for (const r of result.improved) lines.push(`  improved    ${r.id}  recorded ${r.expected}, now ${r.actual} — rerun with --update to hold it`);
  lines.push(result.ok ? 'PASS  evals  no task lost ground' : 'FAIL  evals  the record and this run disagree');
  return lines;
}
