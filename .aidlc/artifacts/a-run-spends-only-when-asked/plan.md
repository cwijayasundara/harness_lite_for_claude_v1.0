---
status: draft
# depends_on: prerequisite-slug, another-prerequisite
---
# Plan: a-run-spends-only-when-asked

## Approach

<The approach and why it fits. Discuss alternatives only when a meaningful tradeoff exists.>

## Files

<Every path this change may touch, in backticks, one per line. `scope-drift` and the write guard
read this section and nothing else: a path not named here cannot be written.>

- `path/to/file`

## Order

1. <Ordered step naming an exact path.>

## Proof

An exact `tests/test_file.py::test_name` can be matched to current pytest JSON
execution in candidate reports. File-only/prose rows remain unverified execution.
Passing execution still requires a reviewer to judge whether it proves the behaviour.

| Behaviour | Test or evidence |
|---|---|
| B1 | <named test or runtime evidence> |

Optional delivery prerequisites belong in depends_on, never extends. When a prerequisite
has a shared interface, add a Dependencies table (Change | Interface | Revision), with
a plain relative repository path and exact Git commit ID. Each Change must appear in
depends_on. Status reports cycles and interface changes; approval/closure is not delivery.
Review local scope overlaps and undeclared cross-file invariants; agree a shared prerequisite,
serialization or integration owner. Run affected integration checks after updating dependencies.
