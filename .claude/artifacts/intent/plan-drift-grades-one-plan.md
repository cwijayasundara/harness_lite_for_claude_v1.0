# Intent: plan-drift-grades-one-plan

- **Date:** 2026-08-24
- **Opened at:** 2026-08-24T00:00:00Z
- **Author:** cwijayasundara
- **Status:** draft <!-- draft | approved | closed -->
- **Source:** review/init-delivers-skills-and-agents.md, open finding 1 — observed on this repository with four changes in flight

## Problem

`plan-drift` grades the entire working tree against exactly one plan, and picks that plan by
recency rather than by relevance.

`currentPlan()` in `.claude/checks/plan-drift.mjs` collects every plan, keeps only the uncommitted
ones, and returns the most recently modified. Every changed file in the repository is then compared
against that single plan's `## Files` block. The comment above it says *"the plan being written in
this change, not the last one git happens to have committed"* — which is correct when one change is
in flight and silently wrong when several are.

Observed while reviewing `init-delivers-skills-and-agents`: four changes were open, so the check
graded that change's diff against `empty-suite-is-not-a-pass.md` and reported eight files as
undeclared drift. Every one of them was declared — in a different plan. Worse, the plan that did
declare them was committed and clean, which excluded it from the candidate pool altogether: a
change becomes *less* reviewable the moment its plan is approved and committed.

The consequences compound. `--stage commit` cannot go green in a repository with parallel work, so
the gate that enforces predictability is the gate a team learns to bypass. And the failure is not
merely noisy — it is wrong in both directions: files genuinely absent from every plan are hidden
inside a wall of false positives.

## Proposed outcome

The drift check answers the question it claims to: is every changed file named by a plan that a
human approved?

- A file named in any approved plan is not reported as drift, regardless of which change is most
  recently touched.
- A file named in no plan is reported, and the message says so plainly rather than naming one
  arbitrary plan it was compared against.
- Committing and approving a plan does not make the change it governs harder to check.
- Several changes can be in flight without the check becoming unusable — a repository with four
  open plans reports drift only for genuinely undeclared files.
- The check still catches the case it was built for: an agent that edits a file no plan mentions.

## Affected users and systems

- `.claude/checks/plan-drift.mjs` and its `currentPlan()` selection.
- `test/plan-drift.test.mjs`.
- Anyone running `--stage commit` locally with more than one change open, and CI on a branch whose
  base has unrelated in-flight plans.

## Constraints

- Zero dependencies.
- The check is roughly 70 lines and is described in its own header as *"worth more determinism than
  any amount of spec ceremony"*. It must not grow into a planning engine.
- An unapproved plan must not silence drift: the gate is human approval, and reading `## Files` from
  a draft would let an agent authorise its own edits by writing a plan.

## Open questions

1. Should the union be over *approved* plans only, or over approved plus the one uncommitted plan
   being written right now? The second is friendlier during implementation and is the current
   spirit; the first is stricter and harder to game. **Author.**
2. When a file is genuinely undeclared, should the finding name the closest plan, list all
   candidates, or name none? Naming one is what produces today's misleading message. **Author.**
3. Does a plan whose status is `approved` but which is *not committed* count? `lifecycle.mjs`
   already refuses to treat an uncommitted approval as an auditable gate, and drift should probably
   agree with it rather than invent a second rule. **Author.**
4. Should this repository stop keeping four changes in flight at once instead? That is a working
   practice, not a code change, and it would leave the defect in place for teams who do the same.
   Worth deciding explicitly rather than by default. **Author.**
