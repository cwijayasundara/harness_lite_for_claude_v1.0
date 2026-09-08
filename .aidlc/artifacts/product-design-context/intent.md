---
status: draft
source: docs/SPDD-TEAM-EVOLUTION-PLAN.md
source_revision: c10e2b5fe7e1242bc5feb827df664517f236a8e5
parent: SPDD-team-evolution
---
# Intent: product-design-context

- **Date:** 2026-09-08
- **Author:** Codex, recording the user's item-5-only request
- **Source:** Item E and “Keeping design current without losing history” in the versioned source.

## Problem

Engineers cannot retrieve a revision-specific product/design view. Approved proposals can
appear to supersede behavior before integration, and structural navigation does not connect
code to delivered requirement and design records. Legacy gaps are easy to mistake for coverage.
The disposable product reproduction records this defect without changing fixture sources.

## Proposed outcome

An engineer requests repository context at an exact revision and can trace delivered rules,
a later reversal and a behavior-preserving refactor back to source, design and proof records.
Pending changes remain proposals. Missing evidence, conflicting replacements and graph misses
are explicit. Historical contracts and execution permissions remain intact.

## Affected users and systems

Engineers and reviewers using graph, pack, map and status; artifact and review evidence readers.

## Constraints

Item 5 only. Preserve items 1–4, existing gates, legacy history and the control budget.
No dependencies, graph database, scheduling, remote writes, deployment inference or paid trials.
Local evidence is inspectable provenance, not a signed host attestation.

## Open questions

None blocking preparation. The concrete spec and plan require the existing human gate decisions.
