---
status: draft
---
# Plan: evolving-scope

## Approach

A campaign is a task with a `steps` array, one step per sprint. The runner already executes steps
in order against one working copy, with per-step assertions between invocations, and no task has
ever used it — so the first job is a fixture and a task that prove the dormant path works, not new
runner code.

Three additions, all in `evals/`:

`evals/lib/campaign.mjs` holds the assertions a campaign needs and the 22 existing tasks do not:
that no later sprint's requirement is visible in the working copy yet (B2), that every approved
`### B<n>` in the copy has a test naming it (B6), and that a named file was modified rather than
replaced (B4). These are file-and-text checks over the staged copy, deterministic, no model.

Two campaign fixtures. `campaign-ledger` is an empty repository with the harness installed and
nothing else, so sprint 1 is genuinely greenfield and sprint 2 is brownfield against sprint 1's
own output. `campaign-legacy` is roughly 400 lines of working, untested, artifact-free code with
one deliberate defect that no sprint asks about — an agent that fixes it on the way past has
produced a diff nobody can review, and B7 fails.

`evals/tasks.json` gains the two campaign tasks with per-step budgets.

Rejected: a separate campaign runner. The steps path exists, is tested by the unit suite through
`runSuite` with a fake invoker, and a second runner would be a second thing that can disagree
about what a step is.

Rejected: fixing what the campaigns find, in this change. Each finding is its own intent. A change
that both discovers and fixes can quietly narrow the discovery to what it already fixed, which is
how a suite comes to grade the harness that was built to pass it.

Rejected: generating the sprint prompts from a product spec held in the fixture. The whole point
of B2 is that the later requirement does not exist anywhere the agent can reach. A generator would
have to hold all of them.

## Files

- `evals/lib/campaign.mjs`
- `evals/fixtures/campaign-ledger/`
- `evals/fixtures/campaign-legacy/`
- `evals/tasks.json`
- `evals/run.mjs`
- `evals/expected.json`
- `test/campaign.test.mjs`
- `.aidlc/artifacts/evolving-scope/`
- `docs/OPERATING.md`

## Order

1. `evals/lib/campaign.mjs` — `unseenRequirements`, `behavioursHaveTests`, `modifiedNotReplaced`.
   Pure functions over a directory path, so `test/campaign.test.mjs` covers them with no model
   and no spend.
2. `test/campaign.test.mjs` — each assertion against a hand-built directory, including the cases
   they must *not* fire on: a test that legitimately moved, a behaviour retired on purpose.
3. Register the three in `evals/lib/assertions.mjs` `CHECKS` so tasks can name them. They join the
   existing vocabulary rather than forming a second one.
4. `evals/fixtures/campaign-ledger/` — an empty repo with `.aidlc/` installed, `[capabilities]`
   wired for Node and TypeScript, and no source. Sprint prompts live in the task, never the
   fixture.
5. `evals/fixtures/campaign-legacy/` — the untested codebase, its one undiscussed defect, and a
   `README` that describes what it does and says nothing about what it should become.
6. `evals/tasks.json` — `campaign-ledger` with three steps and `campaign-legacy` with two, each
   step carrying `budgetUsd` and its own assertions.
7. Run both. Record every failure in `.aidlc/artifacts/evolving-scope/evidence.md` with the
   behaviour it broke and the component responsible.
8. `docs/OPERATING.md` — one section: what a campaign is, when to run it, what it costs, and that
   it is not a per-change gate.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/campaign.test.mjs` — "a multi-step task runs each step against one working copy" via `runSuite` with a fake invoker |
| B2 | `test/campaign.test.mjs` — `unseenRequirements` fires when a later prompt's text is planted in the copy |
| B3 | the `campaign-ledger` run recorded in `evidence.md`, three sprints, stop stage green after each |
| B4 | `test/campaign.test.mjs` — `modifiedNotReplaced` distinguishes an edited test file from a deleted-and-rewritten one |
| B5 | the `campaign-ledger` sprint 3 transcript, asserted with `transcript_matches` on the superseded behaviour id |
| B6 | `test/campaign.test.mjs` — `behavioursHaveTests` fires on an approved spec whose `B2` no test names |
| B7 | the `campaign-legacy` run: pre-existing tests pass, the undiscussed defect is still present |
| B8 | the `campaign-legacy` sprint 1 transcript shows the refusal, then the artifacts, then the write |
| B9 | a step given a 0.01 USD ceiling records `inconclusive`, asserted in `test/campaign.test.mjs` |
| B10 | `.aidlc/artifacts/evolving-scope/evidence.md` exists and every entry names a component |
