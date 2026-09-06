---
status: approved
by: cwijayasundara
at: 2026-09-06T05:26:37.528Z
digest: sha256:7ead74ef556f3a243b6cffe036da409dbc7b1084927011b2ec083f891af5e18c
---
# Spec: a-diff-belongs-to-one-change

## Outcome

A product write is permitted by the plan of the change being made, and by no other. A reader of
`harness status` can see which change that is.

## The shape, argued from the three instances

The intent left the mechanism open and named four candidates. Each instance rules some out.

**A branch name** fails the first and third instance outright: campaign sprints never branch, and
neither does a session in this repository. A convention the workload does not follow governs
nothing.

**The most recently approved plan** fails the third instance, which is the one that settles the
intent. Sprint 3's plan was refused, so the most recently approved plan was sprint 2's, and
sprint 2's plan is exactly what the write was routed through. The guess lands on the wrong change
in the case that matters.

**A declared current change, or a verb that sets one**, would answer all three, but the intent's
first constraint is that a refusal must never invite disabling the guard. A declaration is one
more thing to forget, and the failure mode of forgetting it is a refusal on every write with no
change named, which is F2's dead end reached by a new road.

**The open change whose spec was approved most recently** is what remains, and every instance
already produced that fact. Approving a spec is the one act in the chain that means *this is the
work now*: a human, or the unattended runner standing in for one, decides at gate 1 what is being
built. Sprint 3 approved its spec before its plan was refused, so sprint 3 was current and its
missing plan refuses the write. `lean-v2` is closed, so its plan governs nothing two days later.
A repository with one open change behaves exactly as today, because the newest approved spec is the
only one. Nothing is declared, nothing goes stale on its own, and a change stops being current by
the two acts a change already ends with: closing it, or approving the next one.

The cost is that two changes cannot be implemented in one working copy at once. That is a
restriction the evaluator already lives under — it reviews in a worktree it did not write to —
and a working copy with two changes in flight is the condition every instance was found in.

## Observable behaviours

### B1 — one change is current

Given a repository with zero or more changes under `.aidlc/artifacts/`,
When the harness asks which change a diff belongs to,
Then the answer is the change that is not closed and whose `spec.md` carries the most recent
approval `at:` timestamp, or none when no open change has an approved spec. Closed changes and
draft specs are never current.

### B2 — a product write is permitted by the current change's plan alone

Given the current change has an approved committed plan,
When a product file is written,
Then the write is permitted if that plan's `## Files` names the path, and refused otherwise. The
refusal names the current change and the path. No other change's plan, approved or not, is
consulted.

### B3 — a current change without an approved plan refuses every product write

Given the current change has an approved spec and no approved committed plan,
When a product file is written,
Then the write is refused. The refusal names the change, says its plan is not approved, and says
how to proceed: approve the plan, or close the change. It does not suggest turning
`require_contract` off, and the existing message that does so is removed.

### B4 — a closed change governs nothing

Given a change whose `intent.md` reads `status: closed`,
When a product file its plan names is written under a different current change,
Then that plan grants no permission. `governingPlans()` returns at most one plan: the current
change's.

### B5 — scope-drift asks the same question of the diff

Given a working diff touching product files,
When `harness check --stage commit` runs `scope-drift`,
Then every changed product file must be named by the current change's plan. A file named only by
another change's plan is a finding, and the finding names the current change. A diff with no
current change reports `no-current-change` rather than `no-approved-plan`.

### B6 — the current change is visible

Given a repository with a current change,
When `harness status` runs and when a session starts,
Then both name it, and both say when its plan is not approved. `evidence.md` F6 is the reason
`SessionStart` is named: a fact only available on request never reached an agent that started
working immediately.

### B7 — the campaign proves it

Given `campaign-ledger` sprint 3 under the unattended runner,
When its plan is refused at gate 2,
Then no product file is written until a plan for sprint 3's change is approved, and the sprint's
assertions include one that every product file changed in the sprint is named by the plan of the
change that was current when the sprint ended. This is the F26 run repeated with the outcome the
gate intended.

## Out of scope

- **Ownership with a purpose.** Whether a plan should say what it will do to a path as well as
  which path. The three instances needed a change, not a purpose.
- **Two changes implemented in one working copy at once.** Use a worktree per change, as the
  evaluator already does.
- **A verb to switch the current change.** Approving a spec and closing a change are the two acts
  that already exist. A third would be one more thing to forget.
- **Closing a change automatically** at merge or review approval. Closing stays a hand edit of
  `intent.md`, recorded by the `implement` skill's last step.

## Safeguards

- No new skill and no new hook binding. Skills are 7/7 and bindings 4/5; B6's lines are content in
  bindings that already fire.
- The existing guard tests are the regression suite for the one-change repository: every test in
  `test/guard.test.mjs` that creates a single approved plan must pass unchanged.
- A refusal message must name a next step that keeps the guard on. F2 is the record of what
  happens otherwise.
- `governingPlans()` keeps its signature and stays the one function both the guard and
  `scope-drift` read, so the two cannot disagree about what is governed. That disagreement is the
  third instance.
