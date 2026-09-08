---
status: draft
---
# Intent: pr-candidate-scope

## Problem

The scope sensor rejects an out-of-scope product edit before commit and passes the
same edit after commit in a clean checkout. reproduction.json records this against
a disposable copy of contract-planned; protected fixture sources were not edited.

## Outcome

Implement item 2 (delivery B) of docs/SPDD-TEAM-EVOLUTION-PLAN.md: validate the
complete base-to-candidate diff against one explicitly selected approved change,
with reproducible revision evidence and PR CI integration.

## Constraints

Item 2 only. Preserve item 1 selection, existing approval boundaries, historical
artifacts, zero dependencies, and control limits. No traceability schema, scheduling,
delivery index, or runtime identity work. The implementation request authorizes
preparation; this draft does not manufacture approval of the new spec or plan.
