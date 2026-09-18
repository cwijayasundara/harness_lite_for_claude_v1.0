---
status: draft
---
# Spec: autonomous-delivery-loop

## Outcome

Two human gates, and then a green pull request. Between the plan approval and the merge
decision the harness delivers the change itself, bounded and resumable, and unable to grant
itself either approval it did not receive.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| F10: accepted intent through design/plan approval, implementation, checks/review to a merge-ready PR | B1 |
| F10: interrupted work resumes without repeating successful calls | B2 |
| F10: stale evidence cannot advance a newer revision | B3 |
| F10: bounded failure returns to the appropriate stage or escalates | B5 |
| F02: finite time, turn and attempt limits; stop scheduling after auth or quota failure | B4 |
| F02: a dry preview lists selected work, models and limits without inference | B10 |
| F04: the main suite executes once for a normal commit check | B8 |
| F15: a breach becomes triaged intent that re-enters the ordinary delivery loop | B9 |
| local: the driver cannot open a gate the human did not open | B6 |
| local: the driver cannot declare its own change merge-ready | B7 |

## Observable behaviours

### B1

Given a change whose spec and plan are both approved, committed and currently bound,
When `harness run --change <slug> --live` is invoked,
Then the harness implements the plan, runs the commit-stage checks, obtains an independent
review, repairs what either reports, and opens a pull request — and no human turn occurs
between the plan approval and the PR.

The phases are `implement`, `check`, `review`, `repair`, `pr`. `implement` runs the generator
model with write tools and the project's own hook settings left armed, so the existing
`post-write` fast check keeps returning its findings to the model inside the turn; the inner
code/test/refactor loop is that hook, not a driver phase. `check` is deterministic and invokes
no model. `review` runs the evaluator model read-only against explicit snapshots. The PR body
carries the `Harness-Change: <slug>` line the candidate-scope check parses, and the evidence
bundle for the check invocation that produced its green result.

A run that reaches the PR ends there. The harness does not merge, and reports no claim about
merge readiness beyond the checks it ran and the review it obtained.

### B2

Given a run interrupted after a phase completed — the process killed, the machine restarted,
the CI job cancelled,
When `harness run` is invoked again for the same change,
Then it continues from the phase that had not completed, and the phases that had completed
are not executed again.

Run state is persisted after every transition and read back on start. This is the difference
from what exists: `evals/lib/comparison.mjs` and `evals/lib/campaign.mjs` already write
incremental state that nothing ever reads, which makes a killed run diagnosable but not
resumable. A completed `implement` phase whose session produced a committed diff is not
re-invoked, and the model is not paid a second time for work already on disk.

### B3

Given an interrupted run whose change's approved plan has since been edited or re-approved,
When `harness run` is invoked again for that change,
Then it refuses to continue and says the recorded plan no longer matches the approved one.

The run records the approved plan's digest when it starts. A moved digest means a human
changed the gate, and the authority the run was executing under is gone. Refusing is the
whole point: resuming would carry out an approved-then-withdrawn plan under an approval that
no longer describes it. Starting a fresh run against the new plan remains available.

### B4

Given a run in progress,
When the wall-clock deadline passes, the spend allowance is exhausted, the operator's stop
file appears, or subscription credentials are unavailable,
Then the run stops before the next model call, records which of those four conditions it hit,
and leaves resumable state behind.

No further invocation is scheduled after the condition is observed, so an exhausted quota or
a failed authentication cannot produce a sequence of failing calls. Spend is clamped to the
remaining allowance before each call, and a call whose cost is not reported back reserves its
full allowance rather than being counted as free. A stopped run is `incomplete` with a reason,
which is not the same as a failed one; a bound is not a verdict on the change.

### B5

Given a check failure or a changes-requested review,
When the harness repairs it,
Then it returns to `implement` with the findings, at most twice; a third would-be repair on
the same change stops the run and leaves the decision to the human.

This is `docs/OPERATING.md`'s existing rule for review-driven repair, applied to check
failures by the same count, because a loop that cannot fix something in two attempts is
looping rather than fixing. The stopped run names what remained failing.

### B6

Given a run in any phase, under any bound, including a run that would otherwise stop,
When the run completes or stops,
Then no approval was granted by it: neither gated artifact's approval metadata has changed,
and the harness invoked no approval command.

The existing hook that refuses `harness approve` protects against an *agent* typing it; it
does not protect against a driver process, which runs no hook. So this behaviour is a property
of the driver's own code rather than of a guard around it, and it is asserted directly — the
approval digests of `spec.md` and `plan.md` are compared before and after a full run.

### B7

Given a run that reaches the PR with every check green and no review findings,
When it finishes,
Then the change's review artifact is still `draft`, and the change's next step is still
`implement` rather than `merge`.

`status: approved` in `review.md` is what advances a change to `merge`. It is an unbound key
on an artifact that is not gated and that the write guard always permits, so the harness can
physically write it and must not. A model verdict is not a human approval, and the third gate
is the human's merge against branch protection. This behaviour is what keeps that true once
no human is in the loop to notice.

### B8

Given a repository whose `commit` stage contains both `baseline` and the stage that runs the
test suite,
When `harness check --stage commit` runs,
Then the test suite executes once.

`baseline.capture()` measures the `stop` stage, and `baseline` is a control inside `commit`,
which already ran `stop`. The measurement must reuse that execution when the candidate, the
command and the relevant environment still describe it, and re-run only when they do not. The
standalone `harness baseline capture` path, which has no enclosing check to reuse, keeps
running the stage itself.

### B9

Given a control-band breach at the tier that writes an intent,
When the maintenance example turns it into `intent.md`,
Then that intent carries the source binding the spec approval gate requires, and a spec
written against it can be approved.

The breach detector is the Maintain→Plan edge of the loop. An intent the gate refuses does not
close the loop, it only appears to. The source is the breach evidence and the revision is the
commit it was observed against.

### B10

Given any invocation,
When `--live` is absent,
Then no model is invoked; and when `--dry` is given, the harness prints the phases it would
run, the models each would use and the bounds in force, and exits without spending.

This matches the existing eval runners, where live subscription trials are explicit and
ordinary runs invoke nothing. A preview that costs money is not a preview.

## Design

`harness run` is a new `case` in `.aidlc/bin/harness` over a new `.aidlc/lib/loop.mjs`. Law 2
puts the sequencing there and not in a skill: this is a phase machine, which is exactly what a
SKILL.md may not contain.

**State.** `.aidlc/state/run/<slug>.json` holds the version, slug, base revision, the approved
plan's digest, the current phase, the repair count, the generator's session id, the remaining
allowance, the deadline, an append-only event list and any `incomplete` reason. It is written
after every transition and read on start. The plan digest is the resumption key (B3); the
session id is the token-efficiency key, because a repair that resumes the generator's session
does not re-read the spec, the plan and the code it just wrote.

**Phases reuse what exists rather than reimplementing it.** `implement` goes through
`runSubscriptionClaude`, with the product tool profile the eval invoker already uses and
`--setting-sources project` so the project's hooks stay armed. `check` calls the runner's
`check()` in-process. `review` calls `review()` unchanged — evaluator model, read tools only,
in a `git archive` sandbox that cannot see the working repository. Bounds reuse the
four-condition predicate and the clamp-and-reserve accounting the comparison runner already
proved, rather than a second implementation of "have we run out".

**Two negative properties carry the design.** B6 and B7 are the reason an autonomous loop is
safe here at all, and neither is enforced by a guard: the driver runs no hook, and the artifact
directory is always writable. They are properties of what `loop.mjs` does not contain, so they
are asserted as tests over a complete run rather than argued for in prose.

**Attribution.** Rows the loop produces are recorded with the actor label the run was started
with, so a ledger reader can tell work no human typed from work someone did.

## Out of scope

- **Merging.** The driver stops at a merge-ready PR. Auto-merge was considered and rejected:
  the third gate stays with the human and branch protection.
- **Binding `review.md`, or otherwise closing the `merge` hole for anything but this driver.**
  B7 makes the driver decline to use it. The hole itself is a separate decision.
- **Deploy and Maintain beyond B9.** Those stages are project-owned; this closes the breach's
  re-entry into Plan and nothing further downstream.
- **Risk-proportional review.** Every run reviews. Choosing a cheaper reviewer for low-risk
  changes is backlog F11 and needs evidence this change does not produce.
- **Resolving the recorded disagreement about the hook limit** between the registry, the
  budget test and the operating guide. It is a real Law 3 violation; it is not this change.
- **Closing the stale `implement` rows** in `harness status`, which are delivered work with an
  unclosed intent rather than pending work.

## Safeguards

- **No `[limits]` surface moves.** No skill, agent, hook binding or check is added; the budget
  test passes unchanged. If this change needed one of those, it would be the wrong change.
- **Subscription-only, no API fallback.** Model calls go through the existing subscription
  preflight, which throws on an API key or an alternate provider rather than switching.
- **Ordinary tests invoke no model and require no credential or container.** The driver's
  tests use a fake `claude` on PATH and a temporary git repository.
- **The two gates are asserted, not assumed** (B6, B7). A later simplification that removes
  either assertion removes the only evidence that autonomy here is bounded by human approval.
- **`evals/fixtures/` is untouched.** A fixture edited to make a test pass is a fixture that
  no longer tests.
- **Reported spend is a usage estimate**, not an invoice or an account cap, and is labelled
  that way wherever the run prints it.
- **An interrupted run leaves no lock or partial artifact that blocks a human** from working on
  the change by hand.
- **The commit-stage checks must be green before this is claimed done**, and B8 must not be
  achieved by making the measurement weaker: a changed candidate or command still re-runs.
