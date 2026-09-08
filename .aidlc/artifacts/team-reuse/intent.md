---
status: draft
source: docs/SPDD-TEAM-EVOLUTION-PLAN.md
source_revision: 34835f0c75b43908af3ffccc551fae40e5edbd4f
parent: SPDD-team-evolution
---
# Intent: team-reuse

- **Date:** 2026-09-08
- **Author:** Codex, recording the user's item-6-only request
- **Source:** Delivery F and checklist item 6 at the committed source revision.

## Problem

A consumer records a runtime commit but its shim executes a different checkout without
warning. Doctor does not report runtime or policy identity. Check reports and ledger rows
lack consistent actor and runtime provenance, making shared evidence difficult to audit.
reproduction.json demonstrates the runtime mismatch on a disposable existing product.

## Proposed outcome

Two independently provisioned environments can compare verified runtime and policy content.
Mismatch is actionable, and exported checks retain their original change, actor, candidate
and provenance. An existing proven procedure is reused on a second product slice with real
assertions, without reusing historical permissions.

## Affected users and systems

Engineers installing the shared harness, consumer CI, reviewers and ledger/report readers.

## Constraints

Item 6 only. Preserve earlier item guarantees, historical approvals, zero dependencies and
the control budget. No paid campaign, remote writes, new scheduler or authentication system.
Local identities and actor labels are observations, not signed attestations or host approvals.

## Open questions

Concrete spec and plan await the existing human gate decisions. Local isolated installations
can prove reproducibility here; physical-machine and hosted-CI trials remain separately labelled.
