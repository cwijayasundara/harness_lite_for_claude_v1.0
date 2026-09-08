# Intent: reject-bad-codes

- **Date:** 2026-08-23
- **Author:**
- **Status:** approved

## Problem

A mistyped short code returns a plausible-looking id instead of an error, so users land on someone else's link.

## Proposed outcome

decode() rejects any code containing a character outside the alphabet.

## Affected users and systems

## Constraints

## Open questions

None.
