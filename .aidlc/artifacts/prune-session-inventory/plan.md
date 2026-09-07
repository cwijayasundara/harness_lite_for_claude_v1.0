---
status: approved
by: cwijayasundara (conversation authorization, recorded by Codex)
at: 2026-09-07T13:51:11.968Z
digest: sha256:68bffa531733811497f36630c41212945e59fe68bfd27063e399b159849754a0
spec_digest: sha256:23951116a6fa0c80345345880e0da9e571bc40225d0db98d44d8cf16759ba2ff
---
# Plan: prune-session-inventory

## Approach
Extend the existing comparison selector and staged configuration with one inventory-removal
experiment. Calibrate, run the same ledger and service scenarios, inspect recovery and autonomy,
and record a retention decision with limitations. Keep broken-hook visibility in the banner.

## Files
`CODEBASE-MAP.md`
`evals/run.mjs`
`evals/lib/comparison.mjs`
`evals/lib/assertions.mjs`
`evals/lib/stage.mjs`
`evals/lib/campaign.mjs`
`test/product-trials.test.mjs`
`test/comparison.test.mjs`
`evals/README.md`
`.aidlc/hooks/dispatch.mjs`
`docs/IMPROVEMENT-PLAN.md`
`.aidlc/evals/pruning-summary.json`

## Order
1. Add the isolated experiment and verify the two arms differ only in the intended mechanism.
2. Run bounded calibration and both campaigns, retaining every outcome.
3. Decide whether to retain the simpler banner and document outcome evidence.
4. Run stop and commit diagnostics; report actual results without rewriting prior approvals.

## Proof
| Behaviour | Evidence |
|---|---|
| B1 | test/comparison.test.mjs, staged plugin digests |
| B2 | test/comparison.test.mjs, retained live campaign phases |
| B3 | .aidlc/evals/pruning-summary.json, evidence.md, full checks |
| B4 | test/product-trials.test.mjs, test/comparison.test.mjs, matched run evidence |
