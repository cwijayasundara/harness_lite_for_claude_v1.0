---
status: draft
migrated_from: sha256:26d8a7005c84f0894a2bf8267e39006e6be2e262cdd8762ed1c45f20c83bf1ae
---
# Plan: eval-ratchet

## Approach

A committed `evals/expected.json` mapping task id to expected verdict, and one `harness evals
gate` subcommand that diffs the newest widest results file against it. Recording is an explicit
`--update` that can only raise a task.

Rejected: storing expectations inside `evals/tasks.json`. That file is the suite definition and
is read by `run.mjs` before any model runs; mixing "what we run" with "what we last scored" means
a task cannot be added without asserting a score for it.

Rejected: adding the gate to `[stages] commit`. Results are expensive and go stale within a
session; a gate that reads a week-old file on every commit teaches people to ignore it. This is a
merge-time question, run deliberately.

Rejected: a single aggregate pass-rate number. 17/22 stayed constant across five task renames in
`303b58b` — an aggregate cannot see a substitution, which is precisely how the stale score
survived.

## Files

| Path | Change |
|---|---|
| `.aidlc/lib/eval-gate.mjs` | new — record load, results selection, diff, and the raise-only update |
| `.aidlc/lib/indicators.mjs` | export the results-file selection so the gate and the indicator agree |
| `.aidlc/bin/harness` | new `evals gate` subcommand |
| `evals/expected.json` | new — the committed record |
| `test/eval-gate.test.mjs` | new — B1 to B6 |

## Order

1. Export the results-file selection from `.aidlc/lib/indicators.mjs` so both callers share it.
2. Add `.aidlc/lib/eval-gate.mjs`: `readRecord`, `gate(results, record)` returning
   `{ ok, regressed, improved, missing, unrecorded }`, and `update(record, results)` that throws
   when any task would be lowered.
3. Add the `evals gate` subcommand to `.aidlc/bin/harness`, with `--update`.
4. Write `evals/expected.json` from the full `--repeats 1` run.
5. Add `test/eval-gate.test.mjs` covering B1 to B6 against fabricated results objects — no spend.
6. Run `harness check --stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/eval-gate.test.mjs` — a recorded pass that now fails exits non-zero |
| B2 | `test/eval-gate.test.mjs` — all expected tasks pass exits zero |
| B3 | `test/eval-gate.test.mjs` — improvement reported, exit zero, update required to hold it |
| B4 | `test/eval-gate.test.mjs` — missing and unrecorded task ids both exit non-zero |
| B5 | `test/eval-gate.test.mjs` — `update` throws on a regression |
| B6 | `test/eval-gate.test.mjs` — no results directory exits non-zero |
