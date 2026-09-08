---
status: draft
---
# Intent: worktree-change-selection

- **Date:** 2026-09-08
- **Source:** User request to implement item 1 of docs/SPDD-TEAM-EVOLUTION-PLAN.md.

## Problem

A future backlog intent blocks an engineer's approved product work. A later spec approval
can select somebody else's scope. Separate worktrees share these versioned artifacts.
The disposable contract-planned reproduction records pass before adding future-report,
then fail / draft-awaits-gate for the same owned src/app/text.py edit.

## Proposed outcome

Each worktree explicitly executes one existing change, with authority only from that change's
committed, current approvals. Unrelated backlog entries do not interfere.

## Affected users and systems

Engineers, CLI/status, session context, write guard, scope sensor and campaign readers.

## Constraints

Item 1 only. Preserve genuine delivery gates, historical artifacts, zero dependencies and
control ceilings. No scheduling, trace schema or full PR-diff validation.

## Open questions

None. The user approved the spec and plan in the follow-up conversation; see evidence.md.
