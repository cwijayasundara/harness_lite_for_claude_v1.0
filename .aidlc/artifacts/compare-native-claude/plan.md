---
status: draft
---
# Plan: compare-native-claude

## Approach
Extend the current eval CLI and campaign machinery. Use a separate native staging option and
matched scoped shell grants. Keep the comparison schedule and evidence in the parent. Apply
experimental graph suppression only to disposable plugin copies and supply fresh bounded packs
in the graph arm. Reconcile graph freshness by content and path fingerprint on read and refresh.

## Files
`evals/run.mjs`
`evals/lib/stage.mjs`
`evals/lib/invoker.mjs`
`evals/lib/campaign.mjs`
`evals/lib/comparison.mjs`
`evals/bench/pack-bench.mjs`
`evals/README.md`
`.aidlc/lib/graph.mjs`
`.aidlc/lib/refresh.mjs`
`.aidlc/hooks/dispatch.mjs`
`test/comparison.test.mjs`
`test/product-trials.test.mjs`
`.github/workflows/harness.yml`
`docs/IMPROVEMENT-PLAN.md`
`.gitignore`
`.aidlc/evals/comparison-summary.json`

## Order
1. Implement matched staging, comparison campaigns, records and budget calibration.
2. Repair graph freshness and benchmark, then run deterministic regression and Docker tests.
3. Commit the candidate and run bounded actual-CLI comparisons, retaining all outcomes.
4. Record evidence, complete full checks, merge to main and push under user authorization.

## Proof
| Behaviour | Evidence |
|---|---|
| B1 | test/comparison.test.mjs and actual CLI comparison phases |
| B2 | test/comparison.test.mjs and saved comparison records |
| B3 | test/comparison.test.mjs and bounded calibration records |
| B4 | test/comparison.test.mjs and evals/bench/pack-bench.mjs |
