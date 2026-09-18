# Evidence: a-change-declares-its-relation

## B1–B5 — 2026-09-06

`node --test test/*.test.mjs`: 239 pass, 0 fail. `harness check --stage commit`: all seven PASS. Proof rows B1–B4 are the named tests in `test/supersedes.test.mjs`. B5 was planned for `test/gate-content.test.mjs`, which the plan did not name under `## Files`; scope-drift refused it and the proof lives in `test/supersedes.test.mjs` instead — the Proof table is wrong about the file, the test is not.

## B6

Read from run 5 of the campaign in `one-integration-test/evidence.md`. Closed on landing so that change is current again for the run.
