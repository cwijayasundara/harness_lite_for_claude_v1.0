# Spec: hyphen-titlecase

- **Date:** 2026-08-23
- **Intent:** [.claude/artifacts/intent/hyphen-titlecase.md](../intent/hyphen-titlecase.md)
- **Status:** approved

## Behaviour

1. titlecase() capitalises the first letter of each hyphen-separated part of each word.
2. titlecase() continues to capitalise the first letter of each space-separated word.

## Out of scope

Apostrophes ("o'brien"). Unicode case folding. Any change to callers.

## Domain vocabulary

**word part** — a run of characters between spaces or hyphens.

## Constraints and invariants

Pure function; no I/O.

## Policy concerns flagged

None.
