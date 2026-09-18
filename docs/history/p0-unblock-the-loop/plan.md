---
status: draft
migrated_from: sha256:653bb08d15b705ddc04dd10085e0382c9af3560b273aa87289e9fe17fdbfae8f
---
# Plan: p0-unblock-the-loop

## Approach

Extract the existing target parser into one exported `writeTargets(cmd)` and have both guards ask
it the same question, then filter targets that are not product files (`/dev/*`, and the
`.aidlc/artifacts|state` carve-out the old code applied to the whole command string rather than
per target).

Rejected: adding `2>` as a special case to the existing regex. It fixes the one reported symptom
and leaves the two functions disagreeing about what a write is — which is how the defect survived
its first fix. Rejected: setting `fail_fast = false` to stop the secrets failure hiding the suite.
That treats the symptom and loses fast feedback; the finding is a false positive and should be
marked as one.

## Files

| Path | Change |
|---|---|
| `.aidlc/lib/guard.mjs` | export `writeTargets`; both guards consume it |
| `.aidlc/lib/ledger.mjs` | add `newRun()` |
| `.aidlc/hooks/dispatch.mjs` | rotate the run id on `session-start` |
| `test/gauntlet.test.mjs` | mark line 92 `harness:allow-secret` |
| `test/guard.test.mjs` | regression cases for B1 and B2 |
| `test/unit.test.mjs` | regression case for B4, beside the existing ledger audit test |

## Order

1. In `.aidlc/lib/guard.mjs`, extract the target-collection body of `bashTouchesProtected` into an
   exported `writeTargets(cmd)`; reduce `bashTouchesProtected` to a lookup over its result.
2. In the same file, rewrite `bashContractBlocked` to filter `writeTargets(cmd)` for product-file
   destinations and return `null` when none remain.
3. In `test/guard.test.mjs`, add the B1 and B2 cases.
4. In `test/gauntlet.test.mjs`, append `// harness:allow-secret` to line 92.
5. In `.aidlc/lib/ledger.mjs`, add `newRun(L)` honouring `HARNESS_RUN_ID`.
6. In `.aidlc/hooks/dispatch.mjs`, call `ledger.newRun(cfg.layout)` at the top of `session-start`.
7. Run `harness check --stage stop`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/guard.test.mjs` — redirect of a file descriptor is not a write |
| B2 | `test/guard.test.mjs` — redirect to a product path is still blocked |
| B3 | `harness check --stage stop` output; `test/gauntlet.test.mjs` Phase 4 conformance still asserts `hardening` detects `security-defective` |
| B4 | `test/unit.test.mjs` / ledger report over two rotated ids; `HARNESS_RUN_ID` override |
