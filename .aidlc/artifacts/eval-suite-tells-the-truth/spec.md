---
status: draft
migrated_from: sha256:350b774958e9316b4e85db7957a2dff56e18be417572436e025b261c5f2dff33
---
# Spec: eval-suite-tells-the-truth

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

### B7

Given a path that merely ends with a prompt-prefix filename but is not the repository's own —
`evals/fixtures/_base/.aidlc/harness.toml`,
When `writeBlocked` is asked about it,
Then it is not refused as a cached-prefix file, while the repository's own
`.aidlc/harness.toml` and `.claude/CLAUDE.md` still are.

## Out of scope

The `prefix-cache-guard` defect — `harness init` regenerating a prefix-cache file mid-session
defeats `writeBlocked` — is real and gets its own contract. The `status-grades-two-lifecycles`
defect. Re-calibrating any budget other than the two proven exhausted.

## Safeguards

- B4 exists so B3 cannot be reached by weakening the assertion.
- The fixture's `[stages]` must equal the template's; a test asserts it so the two cannot drift
  apart again silently.
- Inconclusive is never green: the suite exit code and the ratchet both refuse it.
- No fixture source file, no `_base` file other than the stage list, and no task's assertions
  other than `sensor-consulted` are touched.

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
