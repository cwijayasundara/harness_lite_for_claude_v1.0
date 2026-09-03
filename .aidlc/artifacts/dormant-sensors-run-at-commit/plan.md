---
status: draft
migrated_from: sha256:74f4f8d6a914ccc131f44b5d383847628318fdac595ddc291df14a0f7b205c6c
---
# Plan: dormant-sensors-run-at-commit

## Approach

Add `arch` and `test_quality` to the `commit` stage in both the repository registry and the
install template, and add B1 as the general rule that keeps the next sensor from arriving dormant.

Rejected: wiring them into `drift`. `drift` is `[]` here and nobody runs it. It would stop the
audit printing "no stage runs it" while they still never ran — trading a truthful complaint for a
false clearance, which is worse than the complaint.

Rejected: deleting both, which is the audit's other offered option. `arch` is the only thing
enforcing the kernel/adapter boundary, and `test_quality` is the only thing standing between this
repository and a green report on an empty suite. Neither has been judged, because neither has run.
Deleting a control to silence a status line is the inverse of the ledger's purpose.

Rejected: asserting the two names directly in the test. It would pass forever and catch nothing
new; the third dormant sensor would arrive exactly as these two did.

Rejected: re-implementing the stage walk inside the test. Two functions answering "does a stage
run this?" is the shape of half the defects found in this repository over the past week.

Rejected: adding them to `stop` as well. `stop` runs on every agent halt; `commit` is where a
structural rule belongs, and the cheaper stage stays cheap.

## Files

| Path | Change |
|---|---|
| `.aidlc/harness.toml` | `commit` gains `arch` and `test_quality` — the owner's edit, not the agent's |
| `.aidlc/templates/harness.toml` | same, so a generated project wires them from install |
| `evals/fixtures/_base/.aidlc/harness.toml` | the same commit stage as the template — a protected path, so also the owner's edit |
| `test/contracts.test.mjs` | B1: every required-profile command is reachable from a stage |

## Order

1. Add B1 to `test/contracts.test.mjs`, importing `wiredControls` from `.aidlc/lib/ledger.mjs` and
   reusing the existing `harness.toml` discovery walk. Run it and record the B2 failure.
2. Add `arch` and `test_quality` to `[stages] commit` in `.aidlc/templates/harness.toml`.
3. Install from the template into an empty repository and run `harness check --stage commit` there,
   recording the two `SKIP` lines and the zero exit for B5.
4. The owner makes two edits the guard reserves for them. `.aidlc/harness.toml`:
   `commit = ["stop", "scope-drift", "budget", "arch", "test_quality"]`. And
   `evals/fixtures/_base/.aidlc/harness.toml`, to match the template exactly:
   `commit = ["stop", "secrets", "scope-drift", "budget", "arch", "test_quality"]`.
5. `harness check --stage commit`, recording that both sensors now appear with a verdict, and the
   elapsed time for B6.
6. `harness ledger audit`, recording that neither is reported unwired.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/contracts.test.mjs` — a required-profile command no stage reaches fails, naming file, profile and command |
| B2 | the recorded failure of B1 against the registry before step 3 |
| B3 | `test/contracts.test.mjs` imports `wiredControls`; no second stage walk exists in the suite |
| B4 | `harness check --stage commit` output naming `arch` and `test_quality` |
| B5 | `harness check --stage commit` in a template install: both `skipped`, stage passes |
| B6 | the elapsed milliseconds for both sensors in the B4 output |
| B7 | `test/evals.test.mjs` — fixture and template must run the same commit stage; recorded failing against the unedited fixture |
