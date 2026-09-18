---
status: draft
migrated_from: sha256:8668d9b306546696e287e9c50f41761f95802a87ee2816556da19c744007319f
---
# Plan: first-pass-review-can-be-true

## Approach

Walk the review file's history and parse the Status field out of each version. A review has
requested changes when some committed version's Status *field* read `changes-requested` — which is
the question the indicator was always asking.

Rejected: `git log -S '**Status:** changes-requested'`. Narrower, and still a substring match — it
would break the moment the field is reformatted, which is the same fragility one layer down.

Rejected: `git log -G` with a regex anchored to the field. Same objection, and it makes the
indicator depend on the artifact's exact markdown rather than on its parsed content, when a parser
already exists in the same file.

Rejected: removing `changes-requested` from the template comment. It would make the number move
without making the measurement correct, and it would delete the one place a reviewer is told what
the allowed values are.

## Files

| Path | Change |
|---|---|
| `.aidlc/lib/contract-chain.mjs` | `ever_requested_changes` reads the Status field across history |
| `test/indicators.test.mjs` | B1, B2 and B4 |

## Order

1. Replace the `git log -S` in `ever_requested_changes` with a history walk parsing the Status
   field.
2. Add B1's fixture — a review whose Status line carries the template comment — to
   `test/indicators.test.mjs`, plus B2 and B4.
3. `harness check --stage commit`.
4. Read `harness status` for B3.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/indicators.test.mjs` — a template-shaped review signed once is a first pass |
| B2 | `test/indicators.test.mjs` — a review sent back and then approved is not |
| B3 | `harness status` on this repository reads `first-pass review 1/1 (1)` |
| B4 | `test/indicators.test.mjs` — a draft review is in neither part of the rate |
