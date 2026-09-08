---
status: draft
---
# Plan: pr-candidate-scope

## Approach

Extend existing check and artifact consumers with explicit candidate context. Keep
the local default and use a checked-out candidate to reuse committed-gate validation.
Start with the recorded product defect, then cover boundary and CI failure paths.

## Files

- `.aidlc/bin/harness`
- `.aidlc/lib/runner.mjs`
- `.aidlc/lib/artifacts.mjs`
- `.aidlc/lib/diff.mjs`
- `.aidlc/checks/scope-drift.mjs`
- `.aidlc/checks/tamper.mjs`
- `.aidlc/checks/secrets.mjs`
- `.github/workflows/harness.yml`
- `test/scope-drift.test.mjs`
- `test/candidate-scope.test.mjs`
- `test/tamper.test.mjs`
- `test/runner.test.mjs`
- `README.md`
- `docs/SPDD-TEAM-EVOLUTION-PLAN.md`

## Order

1. Preserve reproduction.json and add the failing product-backed committed-diff
   regression in test/candidate-scope.test.mjs without editing fixture sources.
2. Add strict revision resolution and shared diff context; cover NUL-safe paths,
   multiple commits, deletion and both rename endpoints.
3. Extend CLI/runner and artifact selection for invocation-only --change; enforce
   candidate checkout and gate validity, scope inclusion, and revision evidence.
4. Update scope/proof and existing built-in diff checks to consume the boundary;
   preserve local staged, unstaged and untracked checking.
5. Integrate the PR head/merge-base check and explicit PR change line in existing CI;
   exercise the CI command path deterministically and document consumer usage.
6. Run focused regressions, full stop and commit checks, inspect the diff, and record
   exact evidence and limitations in this artifact and the evolution plan. Do not
   mark item 2 delivered until acceptance passes. Do not begin items 3–6.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | test/candidate-scope.test.mjs: clean committed product violation and owned multi-commit candidate |
| B2 | test/candidate-scope.test.mjs: additions, deletion, rename endpoints and unusual filenames |
| B3 | test/candidate-scope.test.mjs: invalid revisions, HEAD mismatch, dirty checkout, gates, borrowing and untracked proof |
| B4 | test/scope-drift.test.mjs: staged, unstaged, untracked and local rename/deletion regressions |
| B5 | test/candidate-scope.test.mjs: CLI exit, report/ledger identities, scope inclusion and diff-based sensor results |
| B6 | test/candidate-scope.test.mjs: real Git PR topology and CI invocation including missing/ambiguous selection; workflow review |

## Approval status

Draft for review. No spec or plan approval has been recorded or committed.
