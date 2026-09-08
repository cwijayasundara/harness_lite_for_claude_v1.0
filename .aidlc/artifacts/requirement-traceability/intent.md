---
status: draft
source: docs/SPDD-TEAM-EVOLUTION-PLAN.md
source_revision: fecbf1466e70a9cc286b5e4cb72fe3e0857e1111
---
# Intent: requirement-traceability

## Problem

An engineer can correct a product requirement or edit a spec's relationship metadata
while its approval still reads as current. A passing candidate scope report does not
say which planned tests actually executed. Local approver labels do not establish host
review authority. reproduction.json demonstrates the first two gaps in a disposable
contract-planned product copy; protected fixture sources are unchanged.

## Proposed outcome

Implement item 3 / delivery C only: connect source revision, intent revision, numbered
behaviours, approval inputs, observed test execution and explicit candidate revisions.
Expose host review evidence separately from local approval labels and model review.

## Constraints

Preserve historical approvals with explicit legacy handling. Extend existing approval,
check, status and review commands; no new control, dependency, gate or budget increase.
Do not implement decomposition, scheduling, a current-product index or runtime identity.
The user's implementation request authorizes this preparation. The repository's spec
and plan approval decisions remain pending; no approval is inferred or fabricated.

## Open questions

None blocking preparation. The concrete spec and plan await the existing human gates.
