---
status: draft
source: docs/IMPROVEMENT-PLAN.md
source_revision: a4118f5421454ba90e6e4388291fc92dd87b68c6
parent: lean-review-coordination
---
# Intent: limit-coordination-context

- **Date:** 2026-09-08
- **Author:** Grok, recording the user's request to take the lean-review
  coordination row through the AIDLC workflow
- **Source:** Lean review, 8 September 2026 in `docs/IMPROVEMENT-PLAN.md` at
  `a4118f5`, second disposition row: coordination and revision-specific
  product context.

## Problem

Item D (decomposition/allocation) and item E (revision-specific product
context) have deterministic product reproductions, so they are not
speculative. Daily use still treats them as a local delivery platform:
`harness status` dumps the whole backlog's overlaps while a change is
selected; README and skills steer people into `delivery.json` archives and
`pack --revision` snapshots; optional assignee fields read like local
assignment authority.

The lean review asked to limit those additions to the demonstrated needs,
prefer tracker links and targeted Git reads, and add no scheduler or new
assignment authority.

## Proposed outcome

Coordination stays a read-only local projection of parent coverage,
dependencies, overlaps and tracker URLs. Product context at a revision is
inspected with `git show` / `git grep`, and `graph query product` only when
delivery records already exist. Selected-change status shows that change's
relationships, not a backlog dashboard. No scheduler, no assignment writes,
and no new delivery-index or pack features.

## Affected users and systems

Engineers and agents using status, intent/plan templates, map and review
guidance, README, and the existing coordination and product-context
commands.

## Constraints

- Do not add a scheduler, assignment verb, remote tracker adapter, or
  assignment authority.
- Do not add skills, agents, hook bindings, or raise `[limits]`.
- Do not expand `delivery.json`, product query types, or revision packing.
- Do not rewrite other changes' approvals or remove the demonstrated D/E
  behaviours (independent approval, parent coverage, depends_on, overlaps,
  pending approval is not delivered).
- Prefer tracker links and targeted Git reads over a thicker local platform.

## Open questions

None
