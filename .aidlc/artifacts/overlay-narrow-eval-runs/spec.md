---
status: draft
migrated_from: sha256:090f16b3afb8cfe7d7d40edb5c2775650a54ea0105d41414f5b711eaf6274e06
---
# Spec: overlay-narrow-eval-runs

## Outcome

Repairing an inconclusive task costs the price of that task, and the record says which run every
verdict came from.

## Observable behaviours

### B1

Given a widest run in which `contract-is-testable` is `inconclusive`, and a later narrow run in
which it is `pass`,
When the gate loads results,
Then `contract-is-testable` reads `pass` and every other task keeps its verdict from the widest
run.

### B2

Given the same pair of runs,
When the record is written,
Then it names both files in `sources`, newest last.

### B3

Given a narrow run that is *older* than the widest run,
When the gate loads results,
Then it is ignored. Overlays move forward in time only.

### B4

Given a narrow run containing a task id absent from the widest run,
When the gate loads results,
Then that id is not introduced. A narrow run corrects the graded set; it does not extend it.

### B5

Given a widest run and a later narrow run that both leave one task `inconclusive`,
When `harness evals gate --update` runs,
Then it still refuses to record. A cheaper resolution path must not become an optional one.

### B6

Given only a widest run and no later files,
When the gate loads results,
Then the behaviour is exactly as before this change, with `sources` naming that one file.

## Out of scope

Expiring an overlay by age or commit distance — noted in the intent, not solved here. Any change
to how the widest run is chosen. The two defects `contract-scope-honesty` and
`prefix-cache-guard`.

## Safeguards

- B4 keeps a narrow run from introducing task ids, so the graded set is only ever set by a full
  run.
- B3 keeps overlays moving forward in time, so re-reading an old results directory cannot revive
  a stale verdict.
- B5 keeps `update`'s refusal on any remaining inconclusive task.
- `sources` makes a multi-run record auditable; a record assembled silently would be worse than a
  stale one.
- `widestResults` is not modified, so the status board's `eval pass rate` keeps reading exactly
  the run it reads today.

## Entities and existing context

- `widestResults` (`.aidlc/lib/indicators.mjs:29`) — max `total`, then lexicographically last.
  Results filenames are ISO timestamps, so lexicographic order is chronological order. Unchanged
  by this work, and B3 depends on that property.
- `loadResults` (`.aidlc/lib/eval-gate.mjs`) — today returns the widest run's body verbatim; this
  is the single place the overlay belongs.
- `verdicts(results)` — `id -> verdict` from `results.results[]`. The overlay is a map merge over
  exactly this.
- `update` (`.aidlc/lib/eval-gate.mjs`) — already throws on any `inconclusive`; B5 is that rule
  surviving the change, not a new one.
- `contract-is-testable` and `budget-forces-deletion` — exhausted at $1 after 16 and 19 turns on
  2026-09-02, having measured 0.6255 and 0.6356 the run before. Both roughly doubled, so both are
  raised to 2.0 here rather than to another multiple of a single observation.
