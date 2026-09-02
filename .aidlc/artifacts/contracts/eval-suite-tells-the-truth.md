# Delivery contract: eval-suite-tells-the-truth

- **Schema:** aidlc.contract/v1
- **Change id:** eval-suite-tells-the-truth
- **Intent ref:** ../intent-refs/eval-suite-tells-the-truth.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** approved
- **Spec approval digest:** sha256:ef6d525492314093609977c5bca846f13e85df3eb233485e49f5add2181d2fa1
- **Plan status:** draft
- **Plan approval digest:** pending

## Outcome

A `FAIL` in the eval suite means the harness failed. Running out of money, losing the transcript,
and grading the wrong control are each named as themselves.

## Observable behaviours

### B1

Given a task whose run ends `subtype: "error_max_budget_usd"` with no `result`,
When the suite grades it,
Then the run is recorded `inconclusive`, not `fail`, carrying the reason; the suite still exits
non-zero, because inconclusive is not green.

### B2

Given such a run,
When the invoker builds its return value,
Then the transcript is not a JSON metadata dump presented as model output.

### B3

Given a model that runs `harness check --stage stop` and pastes its output without typing the
command,
When `sensor-consulted` is graded,
Then it passes.

### B4

Given a model that neither runs the check nor shows its output,
When `sensor-consulted` is graded,
Then it still fails. Narrowing what counts as evidence must not widen what counts as a pass.

### B5

Given the `contract-planned` fixture and an edit to a file outside `## Structure and ownership`,
When `harness check --stage commit` runs inside the fixture,
Then it fails with a `scope-drift` finding.

### B6

Given a results file containing an `inconclusive` task,
When `harness evals gate --update` runs,
Then it refuses to record, because a task whose state is unknown must not enter the ratchet.

## Out of scope

The `prefix-cache-guard` defect — `harness init` regenerating a prefix-cache file mid-session
defeats `writeBlocked` — is real and gets its own contract. The `status-grades-two-lifecycles`
defect. Re-calibrating any budget other than the two proven exhausted.

## Entities and existing context

- `claudeInvoker` (`evals/lib/invoker.mjs:33-40`) — already models "a missing CLI is not a failed
  task" for ENOENT. Budget exhaustion needs the same treatment one level down: per-task, not
  fatal to the suite.
- `invokerFatal` (`evals/run.mjs:110`) — the existing fatal path, for conditions that should stop
  the whole suite. Budget exhaustion is not one of those.
- `runSuite` verdict (`evals/run.mjs:183`) — `passed === runs.length ? 'pass' : passed === 0 ?
  'fail' : 'flaky'`. A third outcome has to be threaded through `summary` and the exit code.
- `evals/fixtures/_base/.aidlc/harness.toml:16` — `plan-drift`; `.aidlc/templates/harness.toml:34`
  — `scope-drift`. The fixture predates the contract model and drifted from what `init` installs.
- `update` (`.aidlc/lib/eval-gate.mjs`) — records whatever verdict it is given.

## Approach and rejected alternatives

Read the CLI's own terminal fields (`is_error`, `subtype`, `terminal_reason`, `errors`) in the
invoker, return `incomplete: { reason, detail }`, and thread a third verdict through the runner.

Rejected: raising the two budgets alone. It would turn today's two red rows green and leave the
next budget exhaustion indistinguishable from a real failure — the defect, not the symptom, is
that exhaustion is scored as failure. The budgets are raised *as well*, because a task that
cannot finish cannot be graded, and the raise is recorded here rather than discovered later.

Rejected: deleting the `transcript_matches` assertion from `sensor-consulted`. The task exists to
prove the model consults the sensor; removing the assertion removes the task. Accepting the
check's own rendered output as evidence is strictly more behaviour and less vocabulary.

Rejected: leaving the fixture and asserting `scope-drift` directly in a unit test. That would
prove the function works while every model-facing eval continued to grade the legacy control —
which is the situation being fixed.

## Structure and ownership

| Path | Change |
|---|---|
| `evals/lib/invoker.mjs` | detect and return budget exhaustion instead of a metadata transcript |
| `evals/run.mjs` | thread an `inconclusive` verdict through runs, summary, and exit code |
| `evals/tasks.json` | `sensor-consulted` accepts the check's output as evidence; raise the two proven-exhausted budgets |
| `evals/fixtures/_base/.aidlc/harness.toml` | `plan-drift` -> `scope-drift`, matching the template |
| `.aidlc/lib/eval-gate.mjs` | `update` refuses to record an inconclusive task |
| `test/invoker.test.mjs` | B1, B2 |
| `test/evals.test.mjs` | B3, B4, and the fixture-matches-template guard |
| `test/eval-gate.test.mjs` | B6 |

## Safeguards

- B4 exists so B3 cannot be reached by weakening the assertion.
- The fixture's `[stages]` must equal the template's; a test asserts it so the two cannot drift
  apart again silently.
- Inconclusive is never green: the suite exit code and the ratchet both refuse it.
- No fixture source file, no `_base` file other than the stage list, and no task's assertions
  other than `sensor-consulted` are touched.

## Operations

1. `evals/lib/invoker.mjs`: return `incomplete` when `is_error` and no `result`, naming
   `terminal_reason` and `errors`.
2. `evals/run.mjs`: record `incomplete` runs, add the `inconclusive` verdict and summary count,
   and keep the non-zero exit.
3. `.aidlc/lib/eval-gate.mjs`: `update` throws on an inconclusive task.
4. `evals/fixtures/_base/.aidlc/harness.toml`: `plan-drift` -> `scope-drift`.
5. `evals/tasks.json`: widen `sensor-consulted`'s evidence; raise the two exhausted budgets.
6. Tests for B1-B6.
7. `harness check --stage commit`, then re-run the five affected tasks.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/invoker.test.mjs` — an exhausted run is inconclusive, not fail |
| B2 | `test/invoker.test.mjs` — the transcript is not a metadata dump |
| B3 | `test/evals.test.mjs` — pasted check output satisfies `sensor-consulted` |
| B4 | `test/evals.test.mjs` — a transcript with neither command nor output still fails |
| B5 | staged-fixture reproduction: `--stage commit` fails with a `scope-drift` finding |
| B6 | `test/eval-gate.test.mjs` — `update` throws on an inconclusive task |
