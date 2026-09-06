---
status: draft
---
# Plan: automated-product-trials

## Approach
Extend the existing runner with explicit product phases and a Docker execution boundary.
Keep scenarios and grading in the parent. Stage only portable plugin files, then run the
actual configured generator with restricted tools and phase-specific mounts. Execute public
APIs and HTTP requests through isolated transports; assertions and expected values stay outside.
Alternative: host temporary directories cannot isolate private grading or approval authority.

## Files
`evals/run.mjs`
`evals/lib/stage.mjs`
`evals/lib/invoker.mjs`
`evals/lib/campaign.mjs`
`evals/lib/assertions.mjs`
`evals/lib/approvals.mjs`
`evals/products.json`
`evals/tasks.json`
`evals/Dockerfile`
`evals/fixtures/campaign-service/`
`test/campaign.test.mjs`
`test/evals.test.mjs`
`test/invoker.test.mjs`
`test/mechanisms.test.mjs`
`test/product-trials.test.mjs`
`.github/workflows/harness.yml`
`docs/IMPROVEMENT-PLAN.md`
`docs/OPERATING.md`
`evals/README.md`
`.gitignore`
`.aidlc/evals/product-summary.json`

## Order
1. Implement isolated staging/invocation and deterministic boundary tests in the existing modules.
2. Extend campaign orchestration and private product checks; evolve ledger first, then service.
3. Run deterministic integration, bounded actual-CLI calibration and both unattended campaigns.
4. Fix discovered defects, retain all attempts, run full checks and record evidence.

## Proof
| Behaviour | Test or evidence |
|---|---|
| B1 | test/product-trials.test.mjs and real Docker isolation probes |
| B2 | test/mechanisms.test.mjs plus live phase/receipt evidence |
| B3 | Parent-owned ledger API assertions across five product changes |
| B4 | Parent-owned HTTP assertions, process restart and persisted data checks |
| B5 | Deterministic adversarial probes and live recovery phases |
| B6 | test/evals.test.mjs, product-trial failure evidence and retained snapshots |
