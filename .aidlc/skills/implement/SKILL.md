---
name: implement
description: Executes an approved plan in small behavioural slices with focused regression proof and runtime verification. Use whenever code is about to be written for .aidlc/artifacts/<slug>/plan.md or someone asks to build an approved change.
context: fork
model: claude-sonnet-5
---

# Implement the approved plan

Read the current spec, plan, relevant code and tests. Understand callers, state and failure
paths; follow existing patterns where they fit. Select this change in the worktree with
`harness status --change <slug>`. Confirm its spec and plan approvals are current and committed.
A missing or branch-mismatched selection requires explicit reselection; no other plan grants scope.
Make routine implementation choices inside the approved design and owned files without
reopening a gate.

## Work in small behavioural slices

For each behaviour, choose the smallest useful proof from the plan:

1. Reproduce a defect or demonstrate the new behaviour is missing before fixing it. Check that
   a failing test fails for the intended reason. Reuse existing tests when they already prove
   preserved behaviour; a documentation edit or pure refactor needs no invented red test.
2. Implement the slice using existing abstractions, with the least complexity that meets the spec.
3. Run the focused proof and `harness check --stage fast --changed`; resolve failures.
4. Refactor with checks green. Exercise the affected runtime path, including relevant edge cases
   and integration boundaries. Report anything the environment prevents you from verifying.

## Test maintenance and boundaries

Tests may change for an approved requirement, corrected test defect, renamed interface, moved
fixture or improved assertion. Explain why the edit still proves the intended behaviour and
retain relevant regression coverage. Do not delete assertions, relax thresholds or rewrite
expected results merely to hide a failure. If the expected behaviour is uncertain, ask the human.
Respect explicit test locks and externally owned evaluation fixtures.

Never write outside `## Files` in the current approved plan. A new path requires an amended,
re-approved and committed plan. Material design, behaviour, safeguard or scope changes return
to the human; routine choices within that boundary proceed. An approval becomes stale after
an artifact edit; preserve the ordinary gate rather than silently widening its authority.

## Before reporting completion

Run `harness check --stage stop` and paste its output. Run the plan's runtime proof and required
commit checks. Report what changed, evidence, remaining defects and uncertainty. A failed
required check prevents verified completion; it does not prevent diagnosis.

When delivery is verified, close the intent with `status: closed` in the final evidence commit.
Do not claim deployment or merge from local tests alone.
