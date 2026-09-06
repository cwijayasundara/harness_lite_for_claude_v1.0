---
status: draft
---
# Intent: an-edited-approval-awaits-its-gate

- **Date:** 2026-09-06
- **Author:** cwijayasundara
- **Source:** `.aidlc/artifacts/one-integration-test/evidence.md` F32 — the fifth instance of
  F10, on run 3 of the five-sprint integration test.

## Problem

`stale-approval` was introduced so that editing an approved artifact could never silently still
read as approved. It reports. It does not govern. Run 3 of the campaign shows what that costs:
sprint 3 appended two behaviours to sprint 2's approved spec, the approval went stale, the stale
spec stopped being current, sprint 1's approved plan became current in its place, and that plan
owns the files sprint 3 then edited. The write was permitted by a change two sprints old.

Three rules now close three routes of one family: a closed change governs nothing, a written
draft awaits gate 1, a named id must be linked. This is the fourth route, and it is the one the
first rule created: making "current" depend on `approved` means anything that is no longer
approved steps aside, and an edited approval is exactly that.

## Proposed outcome

An open change whose spec or plan reads `stale-approval` blocks every product write, naming
itself, until it is re-approved or its approved text is restored. The refusal says both, and says
that a reversal belongs in a new change with `supersedes:`.

## Affected users and systems

- `draftsAwaitingGate()` in `.aidlc/lib/artifacts.mjs`, which becomes the one list of open
  changes waiting on a gate, and through it the guard and `scope-drift`.
- `harness status` and `SessionStart`, which already print that list.

## Constraints

- No new function shape: the list `draftsAwaitingGate` returns grows one case, so the guard, the
  check and the two reporters change wording and nothing else.
- Closed changes stay exempt: a closed change's artifacts are history and may be edited without
  consequence, as today.
- No new skill, hook binding or verb. Law 11: one recorded defect from the campaign.

## Open questions

- None. The plan for the current change with a stale approval already refuses writes; this
  extends the same answer to any open change.
