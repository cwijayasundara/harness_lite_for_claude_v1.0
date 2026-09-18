---
status: draft
migrated_from: sha256:9e91a0a9d3cbcf50da3046b6f5b05c773202ffbe0f827ed36a952fa5cbb0a3ba
---
# Plan: fixtures-are-governed-like-installs

## Approach

Add `[guard] require_contract = true` to `_base`, and extend the existing parity test to compare
the settings that gate the agent rather than only the commit stage.

Rejected: aligning every section of the fixture with the template. `[deployment]`,
`[monitoring]` and `[work_items]` describe a real project's environment; a fixture that declared
them would be asserting things about a world it does not have.

Rejected: changing the `config.mjs` default in this change. It would fix the fixture as a side
effect and quietly change behaviour for every installed project that omits the section — a
much larger blast radius hidden inside a fixture fix.

Rejected: leaving the fixture and accepting that `contract-scope-honesty` grades a weaker
configuration. That is what has been happening; it produced two misread results, and the third
reading only came from checking the fixture rather than the model.

## Files

| Path | Change |
|---|---|
| `evals/fixtures/_base/.aidlc/harness.toml` | add `[guard]` with `require_contract = true` |
| `test/evals.test.mjs` | parity test extended from `[stages]` to the agent-gating settings |

## Order

1. Add `[guard] require_contract = true` to `evals/fixtures/_base/.aidlc/harness.toml`. This is a
   protected path and needs a human.
2. Extend the parity test in `test/evals.test.mjs` to compare `require_contract` as well as the
   commit stage.
3. `harness check --stage commit`.
4. Re-run `contract-scope-honesty` for B4.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/evals.test.mjs` — fixture and template agree on the agent-gating settings |
| B2 | `test/evals.test.mjs` — a staged fixture refuses an unowned product write |
| B3 | `test/evals.test.mjs` — an owned path is still writable |
| B4 | the `contract-scope-honesty` eval verdict after the change |
