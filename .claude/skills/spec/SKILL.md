---
name: spec
description: Turns an approved intent.md into a spec.md — numbered testable behaviours, explicit out-of-scope, domain vocabulary, invariants, and flagged policy concerns. This skill should be used once an intent is approved and before any planning or coding, and whenever someone asks what a change should actually do. Requires an existing .claude/artifacts/intent/<slug>.md.
---

# Write the spec

The spec is the contract. Everything downstream — the plan, the tests, the review — is checked
against it, so ambiguity here is paid for three times.

## Do this

1. Read `.claude/artifacts/intent/<slug>.md`. If its status is not `approved`, stop and say so.
2. **Grill the intent against the code**, not against your own assumptions. Find the existing
   behaviour it changes, the existing vocabulary it must reuse, the callers it will break.
3. `bash .claude/bin/harness new spec <slug>` and fill it.
4. Number every behaviour. Each one must be independently testable by a person reading it.
5. Write `Out of scope` before you write anything else in the file. It is the section that
   prevents the change from growing.
6. Flag policy concerns — security, data handling, compliance — and **name who resolves each**.
   You raise them; you do not resolve them.
7. If the change is user-facing, point `## Visual design` at `.claude/artifacts/design/<slug>/`.
   An empty directory is a flagged concern, not a mock you invent.
8. Stop at human gate 1. The spec must be approved before a plan exists.

## Behaviours are testable or they are not behaviours

| Not a behaviour | A behaviour |
|---|---|
| "Search should be fast" | "Search returns in under 500ms at p95 for a 10k-row tenant" |
| "Handle errors gracefully" | "A timeout returns 503 with a Retry-After header and logs one warn line" |
| "Improve the UX" | "Submitting an invalid email shows the error inline without clearing the form" |

## Anti-patterns

- Restating the intent in longer words.
- Naming files, classes, or libraries. That is the plan's job.
- Silently resolving an open question from the intent. Answer it with the person, or carry it.
