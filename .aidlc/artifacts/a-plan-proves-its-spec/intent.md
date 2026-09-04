---
status: draft
---
# Intent: a-plan-proves-its-spec

- **Date:** 2026-09-04
- **Author:** cwijayasundara
- **Source:** `.aidlc/artifacts/evolving-scope/evidence.md` F14, campaign run 2026-09-04

## Problem

Sprint 2 of `campaign-legacy` wrote a spec with four behaviours and a plan with a Proof row for
none of them, and both were approved. The failure surfaced two steps later, through an eval
assertion that does not exist in a real repository:

```
member-report B1: plan.md's Proof table names no row
member-report B2: plan.md's Proof table names no row
member-report B3: plan.md's Proof table names no row
member-report B4: plan.md's Proof table names no row
```

`.aidlc/skills/plan/SKILL.md` is unambiguous: "One row per behaviour in the spec, naming the test
that will prove it. Every `B<n>` in the spec appears exactly once. A behaviour with no proof is a
behaviour nobody will notice breaking." Nothing enforces it. `approve()` checks that the artifact
is committed, that a plan follows an approved spec, and that the body digest is recorded. It never
reads the spec's behaviours while approving the plan whose entire job is to prove them.

So gate 2 — the gate whose subject is *how this will be proved* — passes a plan that proves
nothing, and says nothing. In a real repository the change then merges.

This is not the agent being careless in an unusual way. `evidence.md` F11 and F15 record that
across two campaigns, two fixtures and five slugs, **every** plan an agent wrote unprompted had
Proof rows that name prose rather than a resolvable test. F14 is the same weakness one step
further along: rows that are not merely unverifiable but absent.

**Added 2026-09-04, after F17.** The same absence exists one step earlier: `approve` accepted a
`spec.md` that was still the unedited scaffold `harness new` writes — angle-bracket placeholders and
a bare `Given ... When ... Then ...` — and stamped a human's name and a digest on it. Every
precondition behaved correctly. Nothing checks that an artifact says anything. F14 is a plan
approved without proving its spec's behaviours; F17 is a spec approved without stating any. The
gates verify an artifact's *state* and never its *content*, and one change should close both.

## Proposed outcome

A plan cannot be approved while a behaviour in its spec has no proof row, and neither a spec nor a
plan can be approved while it is still the template.

The check is mechanical and the data is already on both sides: `### B<n>` headings in `spec.md`,
a Proof table in `plan.md`. `evals/lib/campaign.mjs`'s `behavioursHaveTests` is most of the
implementation and was written for exactly this comparison — it simply runs in the eval suite,
after the fact, instead of at the gate.

## Affected users and systems

- Every change from here on, including this one. The check must pass against the repository's own
  twenty-four existing plans, or it must say clearly which ones it would have refused and that is
  a finding rather than a reason to weaken it.
- `.aidlc/lib/artifacts.mjs`, where `approve()` lives.
- Possibly `.aidlc/checks/`, if the right home is `--stage commit` rather than the gate. Both are
  defensible and the spec decides.
- `evals/lib/campaign.mjs`, whose `behavioursHaveTests` may become a caller of the shared
  implementation rather than a second one.

## Constraints

- **Law 11 is satisfied.** A failing eval (`evolving-scope` B6 firing on `member-report`) and a
  defect from a real run. That earns this check and nothing wider.
- The budget is full. No new skill, no new hook binding.
- Zero dependencies.
- The check must not require the pytest node-id row shape. F11 and F15 establish that no agent and
  no plan in this repository writes it. A check that demands a shape nobody produces would refuse
  every plan, which is how a gate stops being read and starts being worked around — `evidence.md`
  F2 records an agent doing exactly that to `require_contract`.

## Open questions

- **Gate or check?** Refusing at `approve` stops the defect at the moment of decision, and a person
  who cannot approve is a person who reads the message. Refusing at `--stage commit` catches it in
  CI too, and does not make the human's verb fail. Possibly both, with the gate as the loud one.
  Answered by: the spec, before gate 1.
- **What counts as a row?** F11 and F15 say a row will name prose. Requiring a *resolvable test* and
  requiring *a row at all* are very different bars, and only the second is supported by the evidence
  gathered so far. Deciding to demand more than presence would be guessing.
- **What about the twenty-four existing plans?** Run the check against them before deciding
  anything, and treat the result as data. `lean-v2` is already known to name three test files that
  do not exist.
