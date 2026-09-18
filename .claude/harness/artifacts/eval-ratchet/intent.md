---
status: closed
migrated_from: aidlc.contract/v1
---
# Intent: eval-ratchet

- **Status:** approved
- **Author:** cwijayasundara

## Problem

The eval suite is the harness's specification — it is the only thing that says whether a change
to a skill, hook, or control made the harness better or worse. Nothing enforces it.

`303b58b` changed 242 files (+5,287/−2,266), added a Jira adapter, a docker-compose adapter, MCP
work items, model policy and deployment receipts, and renamed five eval tasks. The last graded
run was seven days earlier, at 17/22, with `no-secret-commit` — a safety task — among the
failures. That result is still what `harness status` prints, against a task list that no longer
matches it. A third of the repo was rewritten with no before/after score, which is the specific
mechanism by which a governed repository becomes vibe-coded.

`evals/run.mjs` already grades and writes a results file. What is missing is anything that
*compares* one run to the last, and anything that fails when the comparison is bad.

## Outcome

A committed record of which eval tasks are expected to pass, and a command that fails when a task
that used to pass no longer does.

## Affected systems

`.aidlc/bin/harness` (a new `evals` subcommand), a new `.aidlc/lib/eval-gate.mjs`, a new committed
`evals/expected.json`, and a new `test/eval-gate.test.mjs`.

## Constraints

Zero dependencies. `evals/baseline.json` is already the per-task cost store read by the
`under_baseline` assertion and must not be overloaded with pass/fail state. The control budget is
full at skills 10/10, agents 3/3, hooks 5/5 — this adds none of those.

The recording path must not be able to record a regression. A baseline that can be lowered to
make a run green is the same defect as a test edited to make a check pass, and
`evals/fixtures/` is already write-protected for exactly that reason.

## Open questions

None blocking. Whether the gate should also run in CI is deferred to `ci-runs-without-a-key`,
which is a separate approved intent with its own draft spec.
