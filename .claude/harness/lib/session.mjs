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
import { currentLine } from './artifacts.mjs';

// In an installed project `.claude/harness/bin/harness` is a bash shim; in this repository it is the
// executable itself, and `bash` on it dies with a shell syntax error. The banner printed the
// same line in both, so the harness's own first instruction did not run in its own repository.
// Two directories up from `.claude/harness/lib/session.mjs` is `.claude/harness`, the same root the hook computed.
const HARNESS = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const invocation = (cfg) =>
  path.resolve(cfg.layout.harness) === path.resolve(HARNESS)
    ? 'node .claude/harness/bin/harness'
    : '.claude/harness/bin/harness';

// The exact string the SessionStart hook writes to additionalContext. Rotating the run id is not
// part of it and stays in the hook: this function reads, it does not record.
// G11. The payload is two halves, and the boundary between them is load-bearing.
//
// Everything above STABLE_END is identical from one session to the next in a repository nobody
// has touched: the project, the command to run, the budget, the scope rule, the map's hubs. Below
// it sits everything that moves — a stale graph, a noisy control, which change is open, what was
// superseded. A prompt prefix is only cached while it is byte-identical, and the old order
// interleaved the two: a ledger row count on line 4 moved on every single invocation, which
// invalidated the cache for every line after it. Adding a line above the boundary is a decision
// about cache economics; adding one below it costs nothing.
//
// The ledger row count is gone rather than moved. It was the most volatile line in the payload —
// it changed on literally every check — and no session ever acted on it; `harness ledger` is
// where that question is answered.
export const STABLE_END = 'quality:';

export function sessionContext(cfg) {
  const m = measure(cfg);
  const stable = [
    `harness · ${cfg.project.name ?? path.basename(cfg.layout.root)}`,
    `check:  ${invocation(cfg)} check --stage fast --changed`,
    `budget: ${Object.entries(m).map(([k, v]) => `${k} ${v}/${cfg.limits[k] ?? '-'}`).join(' · ')}`,
  ];

  // Keep the ambient contract short. The PostToolUse and Stop hooks enforce this even when a
  // user starts coding from a one-line prompt and never invokes a workflow command.
  stable.push(`${STABLE_END} edits run fast checks; Stop runs changed tests; CI owns the full candidate check`);

  const volatile = [];
  // a-diff-belongs-to-one-change B6. Which change a write belongs to, and whether that
  // change can permit one yet. Pushed here for the F6 reason: an agent that starts working
  // immediately never asks `status`, and a refusal it cannot predict is one it routes around.
  try { volatile.push(currentLine(cfg)); } catch { /* artifacts unreadable: the guard will say so on the first write */ }

  return [...stable, ...volatile].join('\n');
}
