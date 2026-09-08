---
status: draft
---
# Plan: worktree-change-selection

## Approach

Repair the shared authority resolver, then adapt its existing consumers. Extend status with
selection/clear options rather than introducing a command or control. Require explicit
selection for legacy workflows so ambiguity cannot silently grant authority.

## Files

- `.aidlc/lib/artifacts.mjs`
- `.aidlc/lib/guard.mjs`
- `.aidlc/checks/scope-drift.mjs`
- `.aidlc/bin/harness`
- `.aidlc/hooks/dispatch.mjs`
- `.aidlc/instructions.md`
- `.aidlc/skills/intent/SKILL.md`
- `.aidlc/skills/implement/SKILL.md`
- `evals/lib/campaign.mjs`
- `evals/lib/stage.mjs`
- `test/`
- `README.md`
- `docs/SPDD-TEAM-EVOLUTION-PLAN.md`

## Order

1. Preserve reproduction.json: the unchanged product fixture passes before an unrelated
   intent and fails afterward. Add the regression in test/current-change.test.mjs.
2. Implement Git-worktree-local binding and shared selection validation in artifacts.mjs.
   Validate both spec and plan approval and committed state; scope draftsAwaitingGate.
3. Extend harness status, guard and scope messages and existing session reporting.
4. Adapt sequential fixture/campaign setup and selection tests explicitly. Preserve assertions
   preventing borrowing; replace only assertions for intentionally superseded global selection.
5. Exercise two real worktrees, restarts, branch changes, detached HEAD, bad/missing/closed
   targets, missing/uncommitted/stale gates and out-of-scope writes. Check CLI failure messages
   and drafting/read-only behavior. Do not edit protected fixture sources.
6. Run focused tests and full stop/commit stages; inspect budget and regression results.
   Document compatibility, exact evidence and remaining item 2 limitation in the handoff.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | test/current-change.test.mjs: two actual linked Git worktrees and independent selections |
| B2 | reproduction.json and product-backed current-change/scope tests after repair |
| B3 | test/current-change.test.mjs, test/guard.test.mjs, test/scope-drift.test.mjs: missing, stale, uncommitted spec/plan and borrowed scope |
| B4 | CLI/guard regression cases for absent, malformed, missing and closed selections; artifact writes remain possible |
| B5 | Fresh CLI/session processes, real branch switches and detached HEAD tests |
| B6 | test/lifecycle-cli.test.mjs and existing campaign tests with explicit sequential selection; full stop/commit checks |

## Approval status

Draft only. No spec or plan approval has been created. Implementation begins after the
repository's human gates are recorded and committed.
