# Intent: hyphen-titlecase

- **Date:** 2026-08-23
- **Author:** CK
- **Status:** approved

## Problem

Hyphenated names render with a lowercase letter after the hyphen, so "mary-jane watson" is
shown as "Mary-jane Watson" on invoices and customers complain.

## Proposed outcome

Every alphabetic character that begins a word part is capitalised, including after a hyphen.

## Affected users and systems

Invoice rendering, customer-facing emails.

## Constraints

No change to how spaces are handled.

## Open questions

None.
