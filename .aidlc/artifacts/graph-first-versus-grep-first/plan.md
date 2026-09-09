---
status: draft
depends_on: a-block-names-its-rule
---
# Plan: graph-first-versus-grep-first

## Approach

Build the arms, build the product, prove both without spending, then spend once.

The pair and the arm branch come first because they are small and testable with
no model: `comparisonPairs` is a pure function with unit coverage, and the
campaign's prompt construction can be asserted by inspecting the instruction the
arm would send. The discriminating product comes next and is the larger half —
it is a fixture with its own failing-then-passing tests, and it is checked the
way every fixture is, by running its own suite and by confirming a do-nothing
model fails its assertions.

Only when both are green offline does the paid run happen, once, inside
USD 10 and 40 minutes, with `--comparison retrieval`. The runner enforces both
bounds and records what did not run, so the failure mode of the spend is a
partial record rather than an overrun.

Recording comes last and reports whatever happened. A tie is written as a tie, a
short run as a short run. The two documentation behaviours, B4 and B5, need no
model and are done regardless of how the run ends.

`depends_on: a-block-names-its-rule` records that all three open changes edit
`docs/IMPROVEMENT-PLAN.md`; this one goes last.

## Files

- `evals/lib/comparison.mjs`
- `evals/lib/campaign.mjs`
- `evals/products.json`
- `evals/fixtures/retrieval-app/`
- `evals/evidence/`
- `test/comparison.test.mjs`
- `docs/IMPROVEMENT-PLAN.md`

## Dependencies

| Change | Interface | Revision |
|---|---|---|
| retire-change-safely | `docs/IMPROVEMENT-PLAN.md` | the commit that lands it |
| a-block-names-its-rule | `docs/IMPROVEMENT-PLAN.md` | the commit that lands it |

## Order

1. Add the `retrieval` pair to `comparisonPairs` in `evals/lib/comparison.mjs`
   and accept `retrieval` as a `--comparison` value in `evals/run.mjs`'s
   validation. Extend `test/comparison.test.mjs` to assert the pair's arms and
   that the existing three pairs are unchanged.
2. Branch the campaign step in `evals/lib/campaign.mjs`: for `graph-first`,
   replace the retrieval sentence in the instruction and build the index in the
   work directory; inject no pack for either arm. Leave `config.graph`'s
   existing injection path untouched. Assert the two arms' instructions differ
   in the intended way and that neither contains a rendered pack.
3. Build `evals/fixtures/retrieval-app/` and its `evals/products.json` entry:
   enough modules that the file to change is not guessable, at least one symbol
   name occurring in two modules, steps with behaviours, scoped files and its
   own test command. Confirm its tests fail before each step and pass after.
4. Confirm a do-nothing model fails the new product's assertions, the way
   `test/rehearsal.test.mjs` requires of every task.
5. Run `harness check --stage stop` with no model spend and confirm the suite is
   green, including `test/ledger-evidence.test.mjs`,
   `test/skills-context.test.mjs` and `test/host-evidence.test.mjs` unedited.
6. Run the comparison once:
   `node evals/run.mjs --compare --comparison retrieval --max-suite-usd 10
   --max-suite-minutes 40`. Copy portable outcomes into `evals/evidence/`,
   retaining failed and interrupted attempts.
7. Rewrite the lean-review graph row and the closing paragraphs in
   `docs/IMPROVEMENT-PLAN.md` with the outcome, its date, the validated and
   unvalidated removal experiments, and the structural finding about the former
   `graph` pair.
8. Give the undated ledger figure its date or remove it in favour of the dated
   snapshot.
9. Run `harness check --stage stop`, then `--stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/comparison.test.mjs`: `comparisonPairs` returns the `retrieval` pair with `grep-first` and `graph-first`, the other three pairs are byte-identical to today's, and the instruction built for each arm contains no rendered pack while differing in its retrieval sentence |
| B2 | `evals/fixtures/retrieval-app/`'s own suite, red before each step and green after; `test/rehearsal.test.mjs` proving a do-nothing model scores zero on its assertions; a test asserting the duplicated symbol name appears in more than one module |
| B3 | `evals/evidence/` run record: per-arm accepted changes, reported USD, latency and retries, every attempt's status retained, and the ceiling recorded alongside what did not run; `test/comparison.test.mjs` keeps proving the budget and deadline paths mark attempts incomplete rather than dropping them |
| B4 | the rewritten lean-review graph row and closing paragraphs in `docs/IMPROVEMENT-PLAN.md`, naming the outcome, its date, the validated session-inventory pruning pair and what remains unvalidated |
| B5 | `docs/IMPROVEMENT-PLAN.md`: one ledger figure, or each with the date it was taken |

## Gate status

Prepared for review. Spec and plan remain drafts. Implementation starts after
the user's `harness approve` of spec, then plan. Step 6 spends against the
user's authorisation of 2026-09-09: USD 10 and 40 minutes, once.
