---
status: draft
migrated_from: sha256:8cfe4bcded3fbe1b58a2957cff670d09062d1ea0bee1b9bd8f01ca1f80edca92
---
# Plan: no-name-points-at-nothing

## Approach

Export the local-check names from `runner.mjs`, then walk every `harness.toml` under the
repository, resolve each stage entry, and fail on anything that is neither a stage, a local check,
nor a verb.

Rejected: extending the `_base` parity test to the examples. Parity would demand `scratch-ts` run
`fmt` because the template does, which is wrong — it is a TypeScript project. The examples differ
on purpose; what they may not do is name something that does not exist.

Rejected: hardcoding the list of configuration files in the test. The defect is a name nobody
checked; a test that only checks the files someone remembered to list reproduces it one layer up.

Rejected: deleting the examples' `[stages]` and letting them inherit defaults. It would fix the
dangling name by removing the thing the examples exist to demonstrate.

Rejected: copying the local-check names into the test. Two lists that must agree is the shape of
every defect this session has found; the test reads the runner's own list.

## Files

| Path | Change |
|---|---|
| `.aidlc/lib/runner.mjs` | export the local-check names |
| `examples/scratch-py/.aidlc/harness.toml` | `plan-drift` -> `scope-drift` |
| `examples/scratch-ts/.aidlc/harness.toml` | `plan-drift` -> `scope-drift` |
| `test/contracts.test.mjs` | B1 to B4 |

## Order

1. Export the local-check names from `.aidlc/lib/runner.mjs`.
2. Add the resolution test to `test/contracts.test.mjs`, discovering every `harness.toml`.
3. Replace `plan-drift` with `scope-drift` in both example configurations.
4. Close `status-grades-two-lifecycles`, naming `retire-the-legacy-lifecycle` as its resolution.
5. `harness check --stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/contracts.test.mjs` — every stage entry in every config resolves |
| B2 | the same test discovers configs by walking the repository |
| B3 | both example commit stages name `scope-drift` |
| B4 | `test/contracts.test.mjs` — the examples still differ from each other |
| B5 | `.aidlc/artifacts/intent/status-grades-two-lifecycles.md` reads `closed` |
