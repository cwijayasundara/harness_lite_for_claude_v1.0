---
status: draft
---
# Intent: one-integration-test

- **Date:** 2026-09-06
- **Author:** cwijayasundara
- **Source:** the 2026-09-05 analysis (section 5 and decision 3), and the owner's instruction on
  2026-09-06: one test project, not several.

## Problem

Three things currently play the part of "the project the harness is tested against":

| project | what it is | state |
|---|---|---|
| `campaign-ledger` | eval fixture, three sprints, greenfield, tests supersession | 12 of 13 green |
| `campaign-legacy` | eval fixture, two sprints, brownfield adoption, Python | green |
| `../dunning` | a real TypeScript application in a sibling repository | 1 of 9 features, local only, no remote |

Each was justified when it was made. Together they are three workloads to keep honest, in two
languages, one of which lives outside the repository with no backup. `lean-v2` B13 names two of
them and the analysis's section 5 proposes resuming the third. The owner wants one.

Two things the analysis asked for have no home in any of the three. A3 asks what happens to the
contract when a sprint is a pure refactor, and what single artifact says what the product does
after several sprints. Neither campaign has such a sprint.

## Proposed outcome

Exactly one integration test exists: `campaign-ledger`, five sprints against one brownfield
fixture, run by one command, unattended, under thirty minutes and five dollars. It covers
everything `campaign-legacy` covered, and the two A3 questions. `campaign-legacy` and `../dunning`
are gone. `lean-v2` B13 is superseded by a behaviour that names the one campaign.

## Affected users and systems

- `evals/tasks.json` and `evals/fixtures/campaign-ledger/`, which the write guard protects and
  this change's plan must therefore name.
- `evals/fixtures/campaign-legacy/`, deleted.
- `test/campaign.test.mjs`, which iterates both fixtures today.
- `docs/OPERATING.md` and `evals/README.md`, which describe two campaigns.
- `../dunning`, a repository outside this one, deleted by hand with the owner's explicit go.

## Constraints

- The fixture stays zero-dependency and plain Node, so `stop` can pass on a staged copy with no
  install step. That is why `campaign-legacy`'s Python is not carried over as Python.
- Fixtures are write-protected; every fixture path this change touches is named in the plan.
- The whole campaign is bounded: `budgetUsd` per sprint times five sprints under five dollars,
  `timeoutMs` per sprint times five under thirty minutes.
- No new control. The two A3 sprints produce findings in `evidence.md`, not features.
- Law 11: the ledger is not the harness, so building it through the harness is a non-harness
  workload.

## Open questions

- **Does sprint 4's refactor leave the spec alone or reach it?** Answered by the run, not here.
  The prompt does not tell the agent what to do with the contract.
- **Can sprint 5 state the product from the artifact chain alone?** Answered by the run. The
  prompt does not forbid reading the code, and the evidence records which the agent used.
