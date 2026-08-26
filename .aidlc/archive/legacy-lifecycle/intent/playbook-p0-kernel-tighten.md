# Intent: playbook-p0-kernel-tighten

- **Date:** 2026-08-24
- **Opened at:** 2026-08-24T12:28:16.020Z
- **Author:** Chaminda Wijayasundara
- **Status:** approved
- **Source:** conversation — playbook 10/10 program, first slice (P0) after the fidelity review of https://claude.com/blog/the-ai-native-sdlc-playbook

## Problem

The playbook says nothing is implemented without an accepted plan, a fix must not weaken its tests, and production actions wait on a named approval. In this repo those rules live in skills and docs.

A session can still edit product files with no approved `plan.md`. The test-lock file is honored if someone creates it by hand; nothing in the CLI creates or clears it. `harness deploy` refuses production without `--approval`, but a shell `deploy` / production command is not stopped by the same rule.

The kernel hook budget is already 5/5. A sixth binding is not available. Later playbook slices (filled spec handoff, intake, review fix-loop, maintain tiers) assume these build-time guards already exist.

## Proposed outcome

When a project opts in, an agent cannot change a product file unless a committed, approved plan lists that file. During a declared bug fix, the named test file cannot be edited until the lock is cleared. A production deploy command without a release authorization is denied the same way `harness deploy` already fails closed. Skills stay at 12, agents at 3, hook bindings at 5. Existing evals that do not opt in still pass.

## Affected users and systems

Claude Code sessions, `PreToolUse` write and bash hooks, `bin/harness`, `harness.toml` `[guard]`, eval fixtures, later P1–P6 slices.

## Constraints

- No new kernel skill, agent, or hook binding. Hook source stays ≤600 lines. CLAUDE.md stays ≤120 lines.
- Hooks fail open on parse errors and record `errored` in the ledger; they must not wedge a session.
- This slice is not filled spec handoff, issue→intent, `@harness-fix`, sigma bands, managed settings, worktrees, or extra plugin agents.
- Zero runtime dependencies.

## Open questions

- **Opt-in default — answered.** `[guard].require_plan` defaults to `false` in templates and in this kernel repo so evals keep working. Product repos turn it on.
- **Scope — answered.** P0 guards shipped; remaining Maintain items live in `playbook-close-maintain`.
