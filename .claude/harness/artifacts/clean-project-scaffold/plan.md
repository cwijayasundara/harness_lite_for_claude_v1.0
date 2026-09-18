---
status: approved
by: cwijayasundara (cleanup authorization in conversation, recorded by Codex)
at: 2026-09-08T08:23:22.085Z
digest: sha256:e2aeed20ccc1844830f8322d6ba1a8631fcab7d85f3b3777ece14cfb403fc475
spec_digest: sha256:ab33c7f8b0042c9394c4e5fc4b48304e6d062f3a92fcc6eaf91a37cfccf01538
---
# Plan: clean-project-scaffold

## Approach
Repair the two reproduced consumer defects and assert the scaffold boundary in existing install tests. Preserve development history; move only curated reports and remove generated/retired example files. Refresh example instructions and install declarations. Document runtime versus development responsibilities.

## Files
`.aidlc/templates/project-instructions.md`
`.aidlc/templates/harness.toml`
`.aidlc/harness.toml`
`test/install.test.mjs`
`examples/`
`evals/evidence/`
`.aidlc/evals/comparison-summary.json`
`.aidlc/evals/product-summary.json`
`.aidlc/evals/pruning-summary.json`
`.aidlc/evals/smoke/`
`README.md`
`docs/OPERATING.md`
`docs/IMPROVEMENT-PLAN.md`
`evals/README.md`
`.gitignore`

## Proof
| Behaviour | Evidence |
|---|---|
| B1 | test/install.test.mjs exact fresh-file inventory and existing reinstall tests |
| B2 | test/install.test.mjs current instructions and maintenance discovery/no-overwrite tests |
| B3 | tracked-file inventory, unchanged report hashes, example checks and full stop/commit checks |
