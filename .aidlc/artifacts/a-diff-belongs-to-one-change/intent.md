---
status: draft
---
# Intent: a-diff-belongs-to-one-change

- **Date:** 2026-09-05
- **Author:** cwijayasundara
- **Source:** `.aidlc/artifacts/evolving-scope/evidence.md` F10 and F26 — three instances

## Problem

`require_contract` and `scope-drift` both ask: *is this path claimed by an approved plan?* The
question worth asking is *is this path claimed by the plan for the change being made?* The harness
cannot ask it, because it has no notion of which change a diff belongs to.

Three instances, three different mechanisms, one missing concept.

**A campaign sprint wrote product code under a previous sprint's contract.** `campaign-ledger`
sprint 3 added `isOverdue` to `src/ledger.mjs`. Sprint 2's approved plan owned that path, so the
guard allowed it. Sprint 3 produced no change of its own — no intent, no spec, no plan — and a
product behaviour changed with nothing describing it. Recorded as F10.

**A generator edited a file under a change that had finished two days earlier.** Implementing
`the-suite-measures-this-harness`, it modified `.aidlc/lib/eval-gate.mjs`, which that change's
`## Files` does not name. `scope-drift` passed because `lean-v2`'s plan owns `.aidlc/lib/` broadly.
Ten approved plans in this repository name something under that directory. The typo that revealed it
was incidental — with no typo, the same write passes and nothing notices.

**A plan was refused at the gate and its work proceeded anyway.** `campaign-ledger` sprint 3, on the
2026-09-05 run: `a-plan-proves-its-spec` B2 correctly refused the plan, because its spec claimed
four behaviours and its Proof table named a row for one. The plan was never approved. The sprint
then wrote `isOverdue` and finished with `stop` green, because `partial-payments`' approved plan
owned the file. **The gate worked and was routed around by ownership.** Recorded as F26.

The third is the one that settles it. A gate that refuses a plan, and a guard that then permits the
work anyway on another plan's authority, is not one control with a hole — it is two controls that
disagree about what is being governed.

## Proposed outcome

A product write is permitted by the plan of the change being made, and by no other.

## Affected users and systems

- `.aidlc/lib/guard.mjs` and `governingPlans()`, which answer the ownership question today.
- `.aidlc/checks/scope-drift.mjs`, which asks the same question of a diff.
- Every campaign sprint, and every change in a repository with more than one approved plan — which
  after a few weeks is every repository.
- Possibly `harness status` and the `SessionStart` notice, if the answer needs an agent to declare
  what it is working on.

## Constraints

- **A guard that refuses too much gets disabled.** `evidence.md` F2 records an agent that responded
  to a refusal by rewriting `harness.toml` to switch `require_contract` off. Whatever this becomes
  must make the common case easy and the wrong case obvious.
- The harness must keep working for a repository with exactly one open change, where the current
  behaviour is already correct and nothing should get harder.
- Zero dependencies. No new skill, no new hook binding — skills are 7/7 and bindings 4/5.
- Law 11 is satisfied three times over. That earns this and nothing wider.

## Open questions

- **How does the harness know which change a diff belongs to?** A declared current change, a branch
  name, the most recently approved plan, or an explicit verb. Each has a failure mode: a declaration
  can go stale, a branch convention breaks for campaigns that never branch, most-recent is a guess,
  a verb is one more thing to forget. Answered by: the spec, which should argue from what the three
  instances would each have needed.
- **What happens when a change legitimately touches a path another plan owns?** Two changes editing
  the same file is ordinary. Refusing that would refuse most real work.
- **Is `scope-drift` the same question or a different one?** The guard asks before a write; the
  check asks about a diff after. They may need different answers, and assuming one answer for both
  is how the current gap was built.
