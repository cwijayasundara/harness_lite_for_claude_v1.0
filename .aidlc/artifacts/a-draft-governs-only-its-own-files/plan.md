---
status: draft
migrated_from: sha256:e348661302dfe14bc5328c2290c504a3c6ae0dc91d0c2d1b011e3d4c5c9fdbb2
---
# Plan: a-draft-governs-only-its-own-files

## Approach

Ask validity of the contracts that own something that changed, rather than of one contract chosen
by mtime. A contract that owns nothing in this diff is not governing this diff.

Rejected: ignoring draft contracts entirely. It would make B2 unreachable — implementing against
a draft would become invisible, which is the failure `contract-scope-honesty` exists to catch.

Rejected: keeping the heuristic and excluding contracts created in this diff. "Created in this
diff" is not the property that matters; owning a changed file is, and it is directly observable.

Rejected: requiring every contract in the tree to be approved before any commit. That is today's
behaviour stated plainly, and it means the artifact chain cannot be used the way it is designed —
draft, seal, implement — because the draft blocks the commit that would seal it.

## Files

| Path | Change |
|---|---|
| `.aidlc/checks/scope-drift.mjs` | validity is asked of contracts that own a changed file |
| `test/scope-drift.test.mjs` | B1 to B4 |

## Order

1. In `.aidlc/checks/scope-drift.mjs`, compute changed files before validity.
2. Report `contract-invalid` for any contract that fails validation *and* owns a changed file.
3. Keep the unowned-file `scope-drift` finding unchanged.
4. Add B1 to B4 to `test/scope-drift.test.mjs`.
5. `harness check --stage commit`, then re-run `contract-scope-honesty` for B5.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/scope-drift.test.mjs` — an unrelated draft does not fail the commit |
| B2 | `test/scope-drift.test.mjs` — a draft owning a changed file still fails |
| B3 | `test/scope-drift.test.mjs` — a stale approval owning a changed file still fails |
| B4 | `test/scope-drift.test.mjs` — an unowned changed file still fails |
| B6 | `test/scope-drift.test.mjs` — a draft sharing an approved contract's path does not fail |
| B5 | the `contract-scope-honesty` eval verdict after the change |
