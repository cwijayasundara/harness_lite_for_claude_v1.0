# Delivery contract: overlay-narrow-eval-runs

- **Schema:** aidlc.contract/v1
- **Change id:** overlay-narrow-eval-runs
- **Intent ref:** ../intent-refs/overlay-narrow-eval-runs.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** approved
- **Spec approval digest:** sha256:090f16b3afb8cfe7d7d40edb5c2775650a54ea0105d41414f5b711eaf6274e06
- **Plan status:** draft
- **Plan approval digest:** pending

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

## Approach and rejected alternatives

`loadResults` keeps the widest run as its base, then walks every results file whose name sorts
after that base, overlaying verdicts for ids the base already contains. It returns the merged
verdict set plus `sources`, oldest first.

Rejected: letting `--update` take an explicit `--results <file>`. It puts the choice of what to
record in the hands of whoever types the command, which is exactly the discretion a ratchet
exists to remove.

Rejected: making the newest run win outright rather than the widest. That is the rule
`eval-ratchet` deliberately avoided — a one-task smoke run would silently become the baseline.

Rejected: recording `inconclusive` into the record as a pending state. It reads as a floor of
"unknown", and the next comparison against it means nothing in either direction.

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/lib/eval-gate.mjs` | `loadResults` overlays newer narrow runs and reports `sources` |
| `.aidlc/bin/harness` | `evals gate` reports how many runs a record was assembled from |
| `evals/tasks.json` | `contract-is-testable` and `budget-forces-deletion` raised to 2.0 |
| `test/eval-gate.test.mjs` | B1 to B6 |

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

## Operations

1. In `.aidlc/lib/eval-gate.mjs`, extend `loadResults` to overlay newer files over the widest
   base, restricted to ids already present, returning `sources`.
2. Carry `sources` into the record written by `update`.
3. Report the source count in the `evals gate` subcommand output.
4. Raise the two budgets in `evals/tasks.json` to 2.0.
5. Add B1 to B6 to `test/eval-gate.test.mjs`.
6. `harness check --stage commit`, then re-run the two tasks and record.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/eval-gate.test.mjs` — a later narrow pass overlays an inconclusive |
| B2 | `test/eval-gate.test.mjs` — `sources` names both files, newest last |
| B3 | `test/eval-gate.test.mjs` — an older narrow run is ignored |
| B4 | `test/eval-gate.test.mjs` — an unknown id in a narrow run is not introduced |
| B5 | `test/eval-gate.test.mjs` — a still-inconclusive task still refuses to record |
| B6 | `test/eval-gate.test.mjs` — a lone widest run behaves as before |
