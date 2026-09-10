---
status: draft
source: docs/DEFECT-REPAIR-PLAN.md
source_revision: 62fea335060175a6327494e6abe04cb37d3c94e4
---
# Spec: a-check-runs-the-suite-once

## Outcome

One `harness check --stage commit` executes the test suite exactly once.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| D2/F04: the suite runs once for one commit-stage run | B1 |
| D2/F04: before-and-after elapsed time on the same local workload | B1 |
| D2/F04: a failing suite still fails the commit stage | B4 |
| D2/F04: `harness baseline check` standalone still runs its own stop stage | B3 |
| D2/F04: the metric keeps measuring the same thing | B2, B5 |
| local: structural equivalence replaces the unachievable byte-equality | B2 |
| local: the reconstruction is stop-shaped, not the commit report | B6 |

## Observable behaviours

### B1

Given a repository whose configured `test` command increments a counter each time it is invoked,
When `harness check --stage commit` runs once on a green tree,
Then the counter reads exactly one.

The elapsed time of the commit stage falls by approximately the duration of one suite run, measured
before and after on the same machine and the same tree, and both figures are recorded.

### B2

Given a green commit-stage run,
When the `baseline` control builds the stop report it measures,
Then that report is structurally identical to the one a fresh `check(cfg, { stage: 'stop', all:
true })` would produce: the same controls in the same order, with the same verdicts, findings,
notes and errors.

Structural, not byte-wise, and the distinction is the point. `render()` at
`.aidlc/lib/runner.mjs:209` writes each control's elapsed milliseconds into the rendered string, so
two runs of an identical green tree never render identically — the same suite measured 65,929 ms
and 95,311 ms in the session that wrote this spec. A byte comparison of two renderings cannot
succeed and therefore cannot be an acceptance test. `ms` is normalised out of the comparison and is
the only field permitted to differ.

### B3

Given no run in flight,
When `harness baseline capture` or `harness baseline check` is invoked as a standalone verb,
Then `capture()` runs its own stop stage exactly as it does today. A verb with nothing to borrow
from borrows nothing, and its result is unchanged.

### B4

Given a repository whose test suite fails,
When `harness check --stage commit` runs,
Then the stage fails, and `baseline` is never reached, because fail-fast stops the run at `test`.

This is what makes the reuse sound rather than merely convenient: the only runs in which `baseline`
sees in-flight results are runs in which every earlier verb passed, so nothing was truncated and
the reused results are the same results a fresh `all: true` run would have produced.

### B5

Given `.aidlc/baseline.json` as recorded before this change,
When the commit stage runs after it,
Then `check_stop_tokens` is within the recorded tolerance and the ratchet does not fire. The
baseline file is not re-captured, not edited, and not owned by this change.

If that proves impossible — if the reconstruction cannot produce an equivalent estimate — the
change stops and returns to the human rather than widening the tolerance or re-recording the
number. The tolerance is 1.10 and stays there.

### B6

Given a commit-stage run, including one invoked with `--base` and `--candidate`,
When the stop report is reconstructed from in-flight results,
Then it contains exactly the verbs `resolveStage(cfg, 'stop')` names, in that order, and carries no
`candidate ... from ...` revision line and no `identity_errors` the stop stage would not have
produced.

The in-flight results of a commit run are a superset of `stop` — they also hold `scope-drift`,
`budget`, `tamper`, `arch` and `test_quality` — and a candidate-mode run adds a revision line at
`.aidlc/lib/runner.mjs:206`. Reusing the commit report wholesale would change `check_stop_tokens`
outright, which is the failure this behaviour exists to prevent.

## Design

`runOne` already returns each control's result to `check()`, which accumulates them. `check()`
passes the results gathered so far to each subsequent control as a third argument to
`mod.run(cfg, files, results)`. Controls that do not want it ignore it; JavaScript makes an unused
third parameter free, and every existing control keeps its current signature.

`.aidlc/checks/baseline.mjs` passes those results to `capture()` as an optional precomputed stop
report. `capture()` uses it when given and calls `check()` when not, so the standalone verbs are
untouched. The filtering to stop-shape happens where the stage is known rather than inside
`capture()`, so that `capture()` keeps one meaning of "the stop report" regardless of who supplies
it.

**Why reuse is sound exactly where it is used, and nowhere else.** `capture()` passes `all: true`
so that fail-fast cannot truncate its measurement. Inside a commit run, `baseline` is reached only
when every earlier verb has passed, so the accumulated results are complete for the stop verbs and
the two are equivalent. Outside a commit run there is nothing to reuse and the old path runs. The
equivalence is a property of the green-stage case, and the metric is defined for a green stage.

**What this change refuses to do.** It does not re-capture `.aidlc/baseline.json`, widen the
tolerance, or change what `check_stop_tokens` means. If the reconstruction moves the number, that
is evidence the reconstruction is wrong, not evidence the baseline needs re-recording.

## Out of scope

- Measuring the SessionStart payload correctly — that is `a-baseline-measures-what-ships`, which is
  approved, unimplemented, and about `session_context_tokens` rather than the duplicate run.
- Emitting progress while a long control runs. The silence that makes this read as a hang goes away
  because the wait goes away; a progress mechanism is a separate concern and a separate change.
- Removing Docker from the test path — `docs/DEFECT-REPAIR-PLAN.md` D3, backlog F18.
- Any change to `writeTargets` or the guard — `a-shell-redirect-is-a-write` D1.
- Retiring `baseline` as a control, or folding it into `budget`. `.aidlc/checks/baseline.mjs`
  records why they are separate and that reasoning is untouched.

## Safeguards

- **No model call, no credential, no network access anywhere in this change.**
- **`.aidlc/baseline.json` is not written.** A change that repairs a measurement must not also move
  the thing the measurement is compared against.
- **Fail-fast behaviour is unchanged.** B4 asserts it rather than assuming it, because the
  soundness of the whole change rests on it.
- **The standalone verbs keep their own execution.** `harness baseline check` with no run in flight
  must not silently start grading a report it did not compute.
- **Zero dependencies; `[limits]` unchanged; no new control.** Law 11: a defect in harness
  machinery earns a fix, not a control.
- **Fixtures under `evals/fixtures/` are governed.** The counter fixture B1 needs is a new fixture
  or an existing one used unchanged; no existing fixture is edited to make a test pass.
