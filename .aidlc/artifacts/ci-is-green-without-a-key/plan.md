---
status: draft
migrated_from: sha256:3e54633a60eb65aa88c791fe94a4497078d963f59622f84fcbb7d7dcc674ff7b
---
# Plan: ci-is-green-without-a-key

## Approach

One repository variable, `HARNESS_MODEL_JOBS`, compared against `enabled` in a job-level `if` on
each of the six. GitHub evaluates job-level conditions before allocating a runner, which is what
B1 requires and what a step-level guard cannot give.

A unit test walks `.github/workflows/`, finds every job that references
`anthropics/claude-code-action` or `ANTHROPIC_API_KEY`, and asserts each carries the guard. That
is B4, and it is the part that survives us.

Rejected: `secrets.ANTHROPIC_API_KEY != ''` as the condition. GitHub does not expose secrets in
job-level `if`, so the guard would have to move into a step — which allocates a runner and starts
the job, failing B1.

Rejected: deleting the six workflows. They are the worked reference for the model seams, and the
owner's 2026-08-24 decision was explicitly to keep them.

Rejected: a per-workflow variable. Six switches is five more chances to leave one on, and the
outcome asks for a repository where *nothing* model-driven runs by default.

Rejected: re-fixing the three causes the archived spec named. They are already fixed, measured
today. Re-doing them would be work against a description of the repository rather than the
repository.

## Files

| Path | Change |
|---|---|
| `.github/workflows/claude-fix.yml` | job-level guard |
| `.github/workflows/claude-review.yml` | job-level guard |
| `.github/workflows/harness-diagnose.yml` | job-level guard |
| `.github/workflows/harness-intent.yml` | **unchanged** — see B7 |
| `.github/workflows/harness-triage.yml` | job-level guard |
| `.github/workflows/harness.yml` | job-level guard on `evals`; `unit` and `cost` untouched |
| `test/contracts.test.mjs` | B2, B4 and B6 |

## Order

1. Add `if: vars.HARNESS_MODEL_JOBS == 'enabled'` to the model-invoking job in each of the six.
2. Add the workflow-walking guard test to `test/contracts.test.mjs` for B2 and B4.
3. Confirm B6 by running the existing contract assertions unchanged.
4. `harness check --stage commit`.
5. Confirm B5 by running the suite and `baseline check` on a PATH with neither `ruff`, `pytest`
   nor `claude`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | the guard is job-level in all six files; GitHub skips before runner allocation |
| B2 | `test/contracts.test.mjs` — every model-invoking job names the one variable |
| B3 | the same guard read as an enabling condition; setting the variable turns all six on |
| B4 | `test/contracts.test.mjs` — a model-invoking job without the guard fails the suite |
| B5 | suite and `baseline check` on a runner-like PATH: 212 tests 0 failures, ratchet exits 0 |
| B6 | `test/contracts.test.mjs` and `test/playbook-pack.test.mjs`, unchanged |
| B7 | `test/contracts.test.mjs` — the intent draft job is not gated, and its model step is |
