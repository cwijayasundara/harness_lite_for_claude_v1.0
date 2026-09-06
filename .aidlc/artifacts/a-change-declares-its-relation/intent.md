---
status: draft
---
# Intent: a-change-declares-its-relation

- **Date:** 2026-09-06
- **Author:** cwijayasundara
- **Source:** `.aidlc/artifacts/one-integration-test/evidence.md` F33 — the fourth instance of
  F9, on run 4 of the five-sprint integration test. Owner's decision 2026-09-06: add the gate
  and run again.

## Problem

Four runs of the campaign, four sprint-3 agents, four contradictions found and described in
prose — "a logical refinement", "the contradiction with add-balance-overdue#B12", "Breaking
Changes", "acknowledging the contradiction with the previous safeguard" — and not one
`supersedes:` line. The last run found it in a Safeguards sentence, so there was no behaviour id
to name and `a-named-behaviour-is-a-link` had nothing to match.

Every gate so far waits for the agent to reach for the field. Nothing asks the question. A spec
approved while other changes are open and approved is a spec that stands in some relation to
each of them, and the chain records that relation nowhere unless the agent volunteers it.

## Proposed outcome

At gate 1, a spec declares its relation to every other open change whose spec is approved:
`supersedes:` a behaviour of it, or `extends:` it. Approval is refused until each is named. The
question is asked at the moment the answer is cheapest, and the answer is on record whichever
way it goes.

## Affected users and systems

- `contentIssues()` in `.aidlc/lib/artifacts.mjs`, and the `approve` path through it.
- `.aidlc/templates/spec.md` and `.aidlc/skills/spec/SKILL.md`, which introduce the field.
- Every repository with more than one open change. This one, today, has two.

## Constraints

- Mechanical: presence of a declaration, validated the way `supersedes:` is. No inference about
  whether `extends:` is true.
- A repository with one open change is unchanged.
- Closed changes need no relation; they are history.
- No new skill, hook binding or verb. Law 11: four instances of one defect on the campaign.

## Open questions

- **Will the eval model write `extends:` for a reversal?** Answered by the run. If it does, the
  assertion stays red and that is the truth about the model, recorded, not a defect to fix.
