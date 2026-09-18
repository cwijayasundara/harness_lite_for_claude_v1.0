# Evidence: an-edited-approval-awaits-its-gate

## B1–B5, B7 — 2026-09-06

`node --test test/*.test.mjs`: 236 pass, 0 fail. `harness check --stage commit`: all seven PASS. Proof rows are the named tests in `test/current-change.test.mjs`, `test/guard.test.mjs`, `test/scope-drift.test.mjs` and `test/gate-content.test.mjs`. The spec was approved with `--anyway` because B7 fixes the marker that refused it; B7 is now green and the override is recorded in the frontmatter.

## B6

Read from run 4 of the campaign in `one-integration-test/evidence.md`. Closed on landing so that change is current again for the run.
