---
status: draft
migrated_from: aidlc.contract/v1
---
# Intent: overlay-narrow-eval-runs

- **Status:** approved
- **Author:** cwijayasundara

## Problem

A task that ends `inconclusive` has no cheap way back to graded.

`harness evals gate` reads the *widest* results file — max task count, newest among equals — so a
three-task smoke run cannot displace a full suite as the graded run. That rule is right, and it
is why re-running one task after fixing its budget changes nothing: the one-task file is ignored,
the twenty-two-task file still says `inconclusive`, and `--update` still refuses to record.

The only remaining move is to re-run all twenty-two tasks to repair one, at roughly thirteen
dollars a time. On 2026-09-02 that bit twice in one afternoon: `contract-is-testable` and
`budget-forces-deletion` both exhausted at $1, after 16 and 19 turns.

This is a gap in the ratchet added by `eval-ratchet`, not in the suite it grades. Making
exhaustion visible was right; leaving no path to resolve it was not.

## Outcome

Re-running the tasks that need it, and recording the result, costs the price of those tasks.

## Affected systems

`.aidlc/lib/eval-gate.mjs`, the `evals gate` subcommand in `.aidlc/bin/harness`, and the two
budgets in `evals/tasks.json` that this exists to let us repair.

## Constraints

The widest run stays the base. A narrow run must not be able to *become* the graded run, only to
correct specific tasks within it — otherwise a one-task smoke run silently becomes the baseline,
which is the failure the widest-run rule was written to prevent.

Every verdict in a record must be traceable to the run that produced it. A record assembled from
several runs without saying so is worse than one that is merely stale.

`update` must still refuse when any task remains inconclusive after overlaying. Making the
resolution path cheaper must not make it optional.

## Open questions

Whether an overlay should expire — a verdict carried forward from a run many commits old is
weaker evidence than one from the current tree. Not addressed here; `sources` records enough for
a reader to judge.
