# Spec: playbook-p0-kernel-tighten

- **Date:** 2026-08-24
- **Intent:** [.claude/artifacts/intent/playbook-p0-kernel-tighten.md](../intent/playbook-p0-kernel-tighten.md)
- **Status:** approved

## Behaviour

1. When `[guard].require_plan` is true, a product-file write is denied unless a committed approved plan lists that path. Artifact and state paths remain writable.
2. When `[guard].require_plan` is absent or false, product-file writes are not blocked by this rule.
3. `harness lock tests --pattern <path>` writes `.claude/state/test-lock.json`. The write guard denies matching paths until `harness lock clear`.
4. A bash command that looks like a production deploy is denied unless `HARNESS_RELEASE_APPROVAL` is set. `harness deploy` production operations still require `--approval`.
5. No sixth kernel hook, fourth kernel agent, or thirteenth kernel skill.

## Out of scope

Filled spec handoff, issue→intent, `@harness-fix`, sigma bands, managed settings, worktrees, extra plugin agents (those are other slices).

## Domain vocabulary

- **Plan-lock:** `[guard].require_plan` on the existing PreToolUse write hook.
- **Test-lock:** `.claude/state/test-lock.json` created by the CLI.

## Constraints and invariants

Hooks fail open on parse errors. Zero runtime dependencies.

## Visual design

Not user-facing.

## Policy concerns flagged

None beyond the existing production-approval gate.
