# Evidence: an-unattended-turn-does-not-end-on-a-question

## B1–B6 — 2026-09-06

`node --test test/*.test.mjs`: 244 pass, 0 fail. `harness check --stage commit`: all seven PASS. Proof rows are the named tests in `test/current-change.test.mjs` and `test/stop-guard.test.mjs`. One earlier test (`a filled-in draft spec awaits gate 1…`) used a hand-written intent as its backlog fixture; under B1 that is declared work, so the fixture now uses the scaffold intent, which is what a backlog item is.

Also found: the `intent` skill still named `harness new intent <slug>` and `harness contract new <slug>` — verbs deleted by lean-v2 — and told the agent not to write spec or plan files. Corrected in the same step.

## B7

Read from run 6 of the campaign in `one-integration-test/evidence.md`. Closed on landing so that change is current again for the run.
