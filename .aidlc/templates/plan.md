---
status: draft
---
# Plan: {{slug}}

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
