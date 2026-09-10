// The token ratchet, as a gate.
//
// why: `.aidlc/lib/baseline.mjs:3` states that keeping token usage in check only means something
// if a regression fails a build. The ratchet was written and `harness baseline check` ran it on
// request, but no stage did, so a rise in the deterministic context surface failed nothing and
// nobody was told. This is a caller for a measurement that already exists — it invents none.
//
// It is not folded into `budget` because the two fail on different evidence: `budget` fails at an
// absolute ceiling a human set, this fails at a relative rise against a recorded observation.
// Merged, a `commit` failure could not say which of the two fired without re-deriving it.

import path from 'node:path';
import * as baseline from '../lib/baseline.mjs';
import { resolveStage } from '../lib/config.mjs';
import { buildReport } from '../lib/runner.mjs';

// D2/F04. `commit` runs `stop` (secrets + the full suite) before it ever reaches `baseline`, and
// `capture()` used to run that whole stage again to measure it -- doubling the elapsed time of
// every commit-stage run for no new information. `check()` now hands each control the results
// gathered so far; `stopReportFrom` turns the subset that makes up `stop` into the same shape
// `capture()` would have measured itself, via the one function that assembles a report
// (`buildReport`, in `../lib/runner.mjs`), so there is no second implementation of that question
// to disagree with the first.
//
// Sound only where it is used: a commit run reaches `baseline` only after every earlier verb has
// either passed or been let through by `--all`, so nothing here was truncated by fail-fast, and
// `identityErrors` is always `[]` -- `check()` stops before calling ANY control, this one
// included, the moment identity checks fail. Not stop-shape (a superset carrying scope-drift,
// budget, tamper, arch, test_quality, and in candidate mode a `revision` line) would move
// `check_stop_tokens` outright, which is the whole risk this repair carries -- see spec B6.
export function stopReportFrom(cfg, results) {
  if (!results) return undefined;
  const verbs = resolveStage(cfg, 'stop');
  const byControl = new Map(results.map((r) => [r.control, r]));
  // A partial set is not a measurement: reconstruct only when every stop verb actually ran.
  if (!verbs.every((v) => byControl.has(v))) return undefined;
  return buildReport(cfg, {
    stage: 'stop', provenance: null, identityErrors: [], evidence: undefined,
    files: [], results: verbs.map((v) => byControl.get(v)),
  });
}

export async function run(cfg, files, results) {
  const rel = path.relative(cfg.layout.root, baseline.file(cfg));
  const base = baseline.load(cfg);
  // A metric with no history is recorded, not graded — the same rule capture and the eval suite
  // already use. A project that has never captured is not a project in regression.
  if (!base) return { verdict: 'pass', findings: [], note: `no baseline recorded — run: ${'harness baseline capture'}` };

  const stopReport = stopReportFrom(cfg, results);
  const result = baseline.compare(base, await baseline.capture(cfg, { stopReport }));
  const findings = [];

  for (const r of result.rows.filter((row) => row.regressed)) {
    findings.push({
      file: rel, line: 0, rule: `baseline/${r.metric}`,
      message: `${r.metric} = ${r.is}, recorded ${r.was} (+${Math.round(r.delta * 100)}%, tolerance ${result.tolerance})`,
      fix: 'reduce what the harness puts in front of the model, or re-capture with `harness baseline capture` when the rise is intended and its reason is written down',
    });
  }

  // B4. Reported, not graded as a ratchet metric: a recorded key the current capture no longer
  // produces means the file has drifted from its schema, and the repair is a re-capture.
  for (const key of result.unknown) {
    findings.push({
      file: rel, line: 0, rule: 'baseline/unknown-metric',
      message: `${key} is recorded but no longer captured — the file has drifted from its schema`,
      fix: 'run: `harness baseline capture`',
    });
  }

  return { verdict: findings.length ? 'fail' : 'pass', findings };
}
