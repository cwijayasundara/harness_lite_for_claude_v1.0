# Intent: linked-eval

- **Date:** 2026-08-24
- **Opened at:** 2026-08-24T12:00:00.000Z
- **Author:** conversation
- **Status:** approved
- **Source:** conversation

## Problem

The golden evals test each AIDLC stage in isolation. Nothing proves that a second
requirement attaches to a shipped design and its code, so a harness that writes a
fresh parallel chain still looks green.

## Proposed outcome

A dummy req B, run against a fixture where req A already shipped, produces intent,
spec, plan, code, and tests for B that name A and leave A's code alone. A do-nothing
model cannot pass.

## Affected users and systems

Harness maintainers; the eval runner; CI `--dry` / live `claude -p` suite.

## Constraints

No new npm package. Zero extra runtime dependencies. Law 9 floor of twenty tasks is
not a cap; this is the sanctioned growth path. Human gates stay real: the runner may
commit a draft to approved between steps, but it must not skip writing the artifacts.

## Open questions

None — the conversation chose a `linked-change` fixture plus a `steps` array on the
runner over a separate `harness_test` package.
