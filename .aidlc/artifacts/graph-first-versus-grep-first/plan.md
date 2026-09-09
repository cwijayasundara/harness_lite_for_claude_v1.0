---
status: approved
depends_on: retire-change-safely, a-block-names-its-rule
spec_digest: sha256:38608a741270a78d3ebbb8d755416cc098638551a093abd8496058e9303f72b3
spec_approval_digest: sha256:3af59b89ba550a827abec95fbc196ce9664109bc7904c178a56f18742608f84a
by: cwijayasundara
at: 2026-09-09T07:24:20.046Z
digest: sha256:ec808c4306a5afb186420097aba851375dcc99df6793559505d7b2cd78962df5
approval_version: 2
approval_digest: sha256:2720359dd8c8ab1482578239d81d47531243fd4f3b91b29cf0f3b319fe110649
---
# Plan: graph-first-versus-grep-first

## Approach

Build the arms, build the product, prove both without spending, then spend once.

Building it turned up two things the spec did not anticipate, both recorded here
before any further code. First, `gradeComparisonProduct` has no generic path: it
dispatches on the product name to `verifyLedger` or `verifyService`, so a new
product needs its own verifier in `evals/lib/assertions.mjs`, now declared.
Second, `configureComparison` neuters the staged plugin's `graph.mjs` for every
harness arm — `load` returns null and `ensure` returns an empty graph — so an
agent told to run `harness graph query` in the work directory would query
nothing. The `graph-first` arm must be exempt from that suppression, or the
comparison measures an index that was switched off. Neither changes what the
experiment is; both change what it takes to run it honestly.

Running it turned up a third, larger thing: the product campaign harness has
drifted behind the harness's own approval gates. `prepareProductChange` writes
an intent with no `source`/`source_revision` and a spec with no `## Requirements`
table, and both have been required since decomposition and requirement
traceability landed. The first smoke attempt failed on `intent requires source
and source_revision`, and the calibration abandoned the run — USD 0.11 of the
ceiling spent, nothing measured. This is not specific to the retrieval pair: it
breaks `campaign-ledger` and `campaign-service` identically, so no product
comparison could have run since those gates landed, and the comparison evidence
already on record predates them. Repairing it is what step 8 costs; both
products are verified to pass both gates afterwards, with no model spend.

The pair and the arm branch come first because they are small and testable with
no model: `comparisonPairs` is a pure function with unit coverage, and the
campaign's prompt construction can be asserted by inspecting the instruction the
arm would send. The discriminating product comes next and is the larger half —
it is a fixture with its own failing-then-passing tests, and it is checked the
way every fixture is, by running its own suite and by confirming a do-nothing
model fails its assertions.

One paid attempt was made and aborted at calibration on the gate drift above,
spending USD 0.11 of the ceiling and measuring nothing. The user then chose to
land the repair and the built pair rather than spend again. That is the result
this change records: the comparison is now runnable and was not run, which is a
different and more useful statement than the row's former condition.

Recording comes last and reports whatever happened. A tie is written as a tie, a
short run as a short run. The two documentation behaviours, B4 and B5, need no
model and are done regardless of how the run ends.

`depends_on` names both landed prerequisites, which edit `docs/IMPROVEMENT-PLAN.md`
as this one does; it goes last of the three.

## Files

- `evals/lib/comparison.mjs`
- `evals/lib/campaign.mjs`
- `evals/run.mjs`
- `evals/lib/assertions.mjs`
- `evals/products.json`
- `evals/fixtures/retrieval-app/`
- `evals/evidence/`
- `test/comparison.test.mjs`
- `test/campaign.test.mjs`
- `docs/IMPROVEMENT-PLAN.md`

## Dependencies

| Change | Interface | Revision |
|---|---|---|
| retire-change-safely | docs/IMPROVEMENT-PLAN.md | 39b65553686aee3f50828f7e6106a0eb87e1278f |
| a-block-names-its-rule | docs/IMPROVEMENT-PLAN.md | 10e4c6f9cf6f04ce1afebb57415f2e8f9d3cad56 |

## Order

1. Add the `retrieval` pair to `comparisonPairs` in `evals/lib/comparison.mjs`
   and accept `retrieval` as a `--comparison` value in both places that
   enumerate the pair names: `evals/lib/comparison.mjs` and `evals/run.mjs`. Extend `test/comparison.test.mjs` to assert the pair's arms and
   that the existing three pairs are unchanged.
2. Branch the campaign step in `evals/lib/campaign.mjs`: for `graph-first`,
   replace the retrieval sentence in the instruction and build the index in the
   work directory; inject no pack for either arm. Leave `config.graph`'s
   existing injection path untouched. Assert the two arms' instructions differ
   in the intended way and that neither contains a rendered pack.
3. Exempt the `graph-first` arm from the graph suppression in
   `configureComparison`, so the index it is told to query is the real one,
   and assert that the `grep-first` arm and every existing arm still have the
   suppression they have today.
4. Add `verifyReporting` to `evals/lib/assertions.mjs` and dispatch to it from
   `gradeComparisonProduct`, following the declarative call-and-assert shape
   `verifyLedger` already uses. Leave the ledger and service verifiers
   untouched.
5. Build `evals/fixtures/retrieval-app/` and its `evals/products.json` entry,
   registering `reporting` in `evals/run.mjs`'s product validator and updating
   the product inventory assertion in `test/campaign.test.mjs`:
   enough modules that the file to change is not guessable, at least one symbol
   name occurring in two modules, steps with behaviours, scoped files and its
   own test command. Confirm its tests fail before each step and pass after.
6. Confirm a do-nothing model fails the new product's assertions. The suite has
   no `test/rehearsal.test.mjs` — the file `evals/tasks.json` names no longer
   exists — so the guarantee is proved directly: the fixture's own suite is red
   before each step and green after, and a test asserts that the unmodified
   fixture fails the assertions each step is graded on.
7. Run `harness check --stage stop` with no model spend and confirm the suite is
   green, including `test/ledger-evidence.test.mjs`,
   `test/skills-context.test.mjs` and `test/host-evidence.test.mjs` unedited.
8. Repair `prepareProductChange` in `evals/lib/campaign.mjs` so the intent binds
   a committed repository source and the generated spec carries a
   `## Requirements` table covering its behaviours. Verify with a real staged
   product and a real `harness approve`, with no model spend, for the retrieval
   product and an existing one.
9. Do not re-run the comparison. The user decided on 2026-09-09, after the first
   attempt aborted, to land the repair and the built pair as the result. Copy the
   aborted run's portable outcomes into `evals/evidence/`, retaining every
   attempt and its status, and record that no comparison result exists. The
   command that would run it, once someone chooses to spend, is
   `node evals/run.mjs --compare --comparison retrieval --id retrieval-app
   --max-suite-usd 10 --max-suite-minutes 40`; without `--id` it also runs against
   two products already known not to discriminate. Copy portable outcomes into `evals/evidence/`,
   retaining failed and interrupted attempts.
10. Rewrite the lean-review graph row and the closing paragraphs in
   `docs/IMPROVEMENT-PLAN.md` with the outcome, its date, the validated and
   unvalidated removal experiments, and the structural finding about the former
   `graph` pair.
11. Give the undated ledger figure its date or remove it in favour of the dated
   snapshot.
12. Run `harness check --stage stop`, then `--stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/comparison.test.mjs`: `comparisonPairs` returns the `retrieval` pair with `grep-first` and `graph-first` only when asked for by name, a default run still returns the same three pairs, the instruction built for each arm contains no rendered pack while differing in its retrieval sentence, and `configureComparison` leaves the graph intact for `graph-first` while still suppressing it for every other harness arm |
| B2 | `evals/fixtures/retrieval-app/`'s own suite, red before each step and green after; `test/comparison.test.mjs` asserting `verifyReporting` fails against the unmodified fixture, so a do-nothing model scores zero, and that the duplicated symbol name is exported by more than one module |
| B3 | `test/comparison.test.mjs`: a staged product's generated intent and spec pass `harness approve` for both gates, so a campaign reaches its first implementation phase at all; `evals/evidence/` carries the aborted run with every attempt's status retained, its USD 0.11 spend, the ceiling it ran under and the calibration reason, and reports no result as complete; `test/comparison.test.mjs` keeps proving the budget and deadline paths mark attempts incomplete rather than dropping them |
| B4 | the rewritten lean-review graph row and closing paragraphs in `docs/IMPROVEMENT-PLAN.md`, naming the outcome, its date, the validated session-inventory pruning pair and what remains unvalidated |
| B5 | `docs/IMPROVEMENT-PLAN.md`: one ledger figure, or each with the date it was taken |

## Gate status

Prepared for review. Spec and plan remain drafts. Implementation starts after
the user's `harness approve` of spec, then plan. Step 6 spends against the
user's authorisation of 2026-09-09: USD 10 and 40 minutes, once.
