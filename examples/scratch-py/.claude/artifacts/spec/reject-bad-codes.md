# Spec: reject-bad-codes

- **Date:** 2026-08-23
- **Intent:** [.claude/artifacts/intent/reject-bad-codes.md](../intent/reject-bad-codes.md)
- **Status:** approved

## Behaviour

1. decode() raises ValueError for an empty code, rather than returning 0.
2. decode() of a code produced by encode() is unchanged for every valid id.

## Out of scope

Case-insensitive decoding. Checksum digits. Any change to ALPHABET.

## Domain vocabulary

<Terms this change introduces or leans on, and what they mean here.>

## Constraints and invariants

<Security, performance, data handling, compliance. Anything that must never be violated.>

## Policy concerns flagged

<Raised, not resolved. Name the owner who resolves each.>
