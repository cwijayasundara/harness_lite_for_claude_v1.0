// What a session is told at start, assembled once.
//
// why: this block used to live inside the SessionStart hook, and `baseline.mjs` reconstructed
// four of its lines to ratchet the token cost. The two drifted until the recorded figure was 52
// tokens against a payload of roughly 649 — the ratchet was grading a string nothing emitted.
// One function, two callers: the hook writes it, the baseline measures it. Adding a line here
// changes both, which is the only property that keeps the measurement honest.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure } from '../checks/budget.mjs';
import * as ledger from './ledger.mjs';
import { staleSince } from './refresh.mjs';
import * as graph from './graph.mjs';
import * as codemap from './map.mjs';
import { supersededBy, currentLine } from './artifacts.mjs';

// In an installed project `.aidlc/bin/harness` is a bash shim; in this repository it is the
// executable itself, and `bash` on it dies with a shell syntax error. The banner printed the
// same line in both, so the harness's own first instruction did not run in its own repository.
// Two directories up from `.aidlc/lib/session.mjs` is `.aidlc`, the same root the hook computed.
const HARNESS = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const invocation = (cfg) =>
  path.resolve(cfg.layout.aidlc) === path.resolve(HARNESS)
    ? 'node .aidlc/bin/harness'
    : '.aidlc/bin/harness';

// The exact string the SessionStart hook writes to additionalContext. Rotating the run id is not
// part of it and stays in the hook: this function reads, it does not record.
export function sessionContext(cfg) {
  const m = measure(cfg);
  const led = ledger.report(cfg.layout, { days: 30 });
  const noisy = led.controls.filter((c) => c.verdict === 'unreliable' || c.verdict === 'candidate-for-deletion').slice(0, 3);
  const lines = [
    `harness · ${cfg.project.name ?? path.basename(cfg.layout.root)}`,
    `check:  ${invocation(cfg)} check --stage fast --changed`,
    `budget: ${Object.entries(m).map(([k, v]) => `${k} ${v}/${cfg.limits[k] ?? '-'}`).join(' · ')}`,
    `ledger: ${led.rows} rows over ${led.runs} runs (30d)`,
  ];
  if (noisy.length) lines.push(`review: ${noisy.map((c) => `${c.control} (${c.verdict})`).join(', ')}`);
  const stale = staleSince(cfg);
  if (stale) lines.push(`graph:  STALE since ${stale} — verify anything load-bearing against the source`);

  // B11. Two lines, so the session knows the map exists and what it says the hubs are.
  // The index was measured at 90% recall and a 96.5% token reduction against reading the
  // files, and nothing had ever used it, because nothing said it was there.
  try {
    const g = graph.load(cfg);
    if (g) lines.push(...codemap.summary(cfg, g));
  } catch { /* no index yet: the map line would be noise, not help */ }
  if (cfg.guard?.require_contract) lines.push('contract: product file edits need the current change\'s committed approved plan to name the path');
  else lines.push('contract: scope enforcement is off; set [guard].require_contract = true for product repositories');
  // a-diff-belongs-to-one-change B6. Which change a write belongs to, and whether that
  // change can permit one yet. Pushed here for the F6 reason: an agent that starts working
  // immediately never asks `status`, and a refusal it cannot predict is one it routes around.
  try { lines.push(currentLine(cfg)); } catch { /* artifacts unreadable: the guard will say so on the first write */ }

  // B4: the same reason F7's map line is here rather than only in `status` — a fact
  // available on request does not reach an agent that begins working immediately (F6). A
  // superseded behaviour's spec is never edited, so nothing else at session start would
  // ever surface it.
  try {
    for (const [link, by] of supersededBy(cfg)) lines.push(`superseded: ${link} — superseded by ${by.join(', ')}`);
  } catch { /* computed from artifacts already on disk; a read failure here is not fatal */ }

  return lines.join('\n');
}
