---
status: draft
source: docs/SPDD-TEAM-EVOLUTION-PLAN.md
source_revision: 4add89e3741e6a652731c488e68140c78900dc0b
---
# Intent: decomposition-allocation

- **Date:** 2026-09-08
- **Source:** User request to implement item 4 only, following its handoff and acceptance criteria.

## Problem

Independent outcomes cannot obtain approval without artificial continuity links to every
open approved change. Teams cannot inspect parent criterion coverage, delivery prerequisites,
shared interface revisions or possible scope collisions in the existing status view.

## Proposed outcome

An initiative can be decomposed into three separately reviewable outcomes. Existing status
shows their source coverage, declared prerequisites, interface expectations and tracker
assignment references, with explicit gaps and coordination findings. Scheduling stays in
the existing issue tracker; each worktree retains its own approved scope.

## Affected users and systems

Engineers and reviewers; artifact approval, templates and status consumers.

## Constraints

Item 4 only. Preserve historical artifacts and genuine approval gates, zero dependencies,
control budget, fixture sources, and item 1–3 guarantees. Local projections cannot certify
remote assignments, integrated delivery, parent acceptance or absence of remote conflicts.

## Open questions

None blocking review of the proposed bounded implementation.
