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

export async function run(cfg) {
  const rel = path.relative(cfg.layout.root, baseline.file(cfg));
  const base = baseline.load(cfg);
  // A metric with no history is recorded, not graded — the same rule capture and the eval suite
  // already use. A project that has never captured is not a project in regression.
  if (!base) return { verdict: 'pass', findings: [], note: `no baseline recorded — run: ${'harness baseline capture'}` };

  const result = baseline.compare(base, await baseline.capture(cfg));
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
