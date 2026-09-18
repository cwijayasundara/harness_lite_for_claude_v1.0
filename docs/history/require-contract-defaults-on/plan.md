---
status: draft
migrated_from: sha256:f2dda9908eb7ee8f91b21dd16387152164eb379ae86804c80f6c271b4b3173fb
---
# Plan: require-contract-defaults-on

## Approach

One default flips. Everything else follows from the spread that already exists.

The parity test changes with it. Comparing declared text was right while the fixture was expected
to declare the section; once the default supplies it, a fixture that says nothing is correct and a
text comparison would fail it for being right.

Rejected: editing the `_base` fixture instead, as `fixtures-are-governed-like-installs` planned.
It fixes one fixture and leaves every project that omits the section ungoverned — including the
three `examples/`. The default is where the defect actually lives.

Rejected: making the flag required, with no default. It turns every existing `harness.toml`
without the section into a hard error on upgrade, which is a worse trade than a control quietly
turning on.

Rejected: defaulting to `true` only when a contracts directory exists. It makes the control's
presence depend on repository shape, so the same command behaves differently in two checkouts —
and "why is the guard not running" becomes a question with a non-obvious answer, which is the
class of problem this change exists to remove.

## Files

| Path | Change |
|---|---|
| `.aidlc/lib/config.mjs` | `require_contract` defaults to `true` |
| `test/guard.test.mjs` | B1 and B2 |
| `test/evals.test.mjs` | parity test compares effective configuration, not declared text |

## Order

1. Flip the default in `.aidlc/lib/config.mjs`.
2. Add B1 and B2 to `test/guard.test.mjs`.
3. Move the parity test in `test/evals.test.mjs` from declared text to effective configuration.
4. `harness check --stage commit`.
5. Re-run `contract-scope-honesty` for B5.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/guard.test.mjs` — an absent `[guard]` yields `require_contract: true` |
| B2 | `test/guard.test.mjs` — an explicit `false` is honoured |
| B3 | `test/evals.test.mjs` — a staged fixture refuses an unowned product write |
| B4 | `test/evals.test.mjs` — fixture and template agree on effective configuration |
| B5 | the `contract-scope-honesty` eval verdict after the change |
