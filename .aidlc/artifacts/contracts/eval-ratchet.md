# Delivery contract: eval-ratchet

- **Schema:** aidlc.contract/v1
- **Change id:** eval-ratchet
- **Intent ref:** ../intent-refs/eval-ratchet.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** approved
- **Spec approval digest:** sha256:c2a4811f2ff995bf107ab70b756515b0f103a20a3fe10f7c7018b0589cb14546
- **Plan status:** draft
- **Plan approval digest:** pending

## Outcome

A harness change that breaks an eval task fails a command, instead of being discovered seven days
and 242 files later.

## Observable behaviours

### B1

Given a committed `evals/expected.json` recording `surgical-fix: pass`,
When the newest results file grades `surgical-fix` as `fail` or `flaky`,
Then `harness evals gate` exits non-zero and names the regressed task.

### B2

Given the same expectation,
When the newest results file grades every expected task `pass`,
Then `harness evals gate` exits zero.

### B3

Given a task recorded as `fail` that now grades `pass`,
When `harness evals gate` runs,
Then it exits zero, reports the improvement, and says the record must be updated to hold it.

### B4

Given a results file in which a task recorded as `pass` is absent, or a graded task is absent
from the record,
When `harness evals gate` runs,
Then it exits non-zero rather than silently grading a smaller suite. An eval renamed without
being re-recorded is the failure this prevents — five were renamed in `303b58b`.

### B5

Given a results file in which a recorded task has regressed,
When `harness evals gate --update` runs,
Then it refuses to write and exits non-zero. The record moves `fail -> pass` only. A baseline
that can be lowered to make a run green is a fixture edited to make a test pass.

### B6

Given no results file at all,
When `harness evals gate` runs,
Then it exits non-zero saying the suite has not been run, and never reports a pass.

## Out of scope

Running the gate in CI — `ci-runs-without-a-key` is a separate approved intent with its own draft
spec, and wiring a job here would duplicate its behaviour 1. Changing `evals/run.mjs`, the task
list, or any fixture. The `status-grades-two-lifecycles` defect.

## Entities and existing context

- `latestEval` (`.aidlc/lib/indicators.mjs:29`) — selects the *widest* results file (max `total`,
  then lexicographically last), so a narrow smoke run cannot displace a full one. The gate needs
  the same selection and it should be shared, not re-derived.
- `evals/baseline.json` — read by `run.mjs:231` and consumed by the `under_baseline` assertion
  (`assertions.mjs:134`) as `{ [taskId]: { [metric]: number } }`. Per-task cost, not pass state.
  The record introduced here is a separate file.
- `.aidlc/evals/results/*.json` — `{ summary, results: [{ id, verdict }] }`, verdict one of
  `pass` / `fail` / `flaky`. `run.mjs` treats flaky as failure ("flaky is not green").
- `evals/fixtures/` — write-protected in `[guard].protected_paths`, the existing precedent for
  B5.

## Approach and rejected alternatives

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

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/lib/eval-gate.mjs` | new — record load, results selection, diff, and the raise-only update |
| `.aidlc/lib/indicators.mjs` | export the results-file selection so the gate and the indicator agree |
| `.aidlc/bin/harness` | new `evals gate` subcommand |
| `evals/expected.json` | new — the committed record |
| `test/eval-gate.test.mjs` | new — B1 to B6 |

## Safeguards

- `--update` is raise-only (B5). There is no flag that lowers a recorded task; lowering is a
  hand edit to a committed file, which is reviewable.
- The gate fails closed: absent results, absent record, and set mismatches are all non-zero
  (B4, B6). Silence is never a pass — the same rule as `An empty suite is not a pass` (6496934).
- No skill, agent, or hook is added; the budget is untouched.
- `evals/baseline.json` and `evals/tasks.json` are not read or written.

## Operations

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
