---
status: draft
# source: relative/repo/document.md or https://ticket.example/123
# source_revision: exact repository commit or externally asserted ticket revision
# parent: stable initiative ID from the source or tracker
# tracker: existing issue URL
# assignee: locally recorded tracker owner
# iteration: locally recorded timebox
# assignment_observed_at: UTC ISO timestamp of the recorded tracker observation
---
# Intent: {{slug}}

- **Date:** {{date}}
- **Author:**
- **Source:** <conversation, ticket URL, or a control-band breach>

`source` and `source_revision` are optional, and they come as a pair: set both or neither.
Set them when this change answers a document somebody else can read — then the approval is bound
to that exact revision and reports a stale approval if the declaration later moves. Leave them
out when the origin is a conversation, a breach or a judgment call; the approval records
`source_kind: unbound`, which is the truth, and `harness status` shows it. Capturing a
conversation in a versioned repository document and referencing its commit is worth doing when
the requirement is contested or long-lived — it is not a precondition for approval.

For child outcomes, use the same parent/source revision and map source criterion IDs in
the spec Requirements table, which is likewise checked when present and not demanded when
absent. A repository source may define an Acceptance criteria table
(Criterion ID | Criterion); status reports unmapped criteria from that exact commit.
Tracker fields are optional unverified projections; update assignments in the tracker
and record the tracker URL. This is not assignment authority.

## Problem

<What is wrong today, in the language of whoever feels it. No solution here.>

## Proposed outcome

<What is true when this is done. Observable from outside the system.>

## Affected users and systems

## Constraints

## Open questions

<Only consequential unresolved questions. Write None when no questions block progress.>
