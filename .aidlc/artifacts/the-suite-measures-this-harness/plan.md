---
status: draft
---
# Plan: the-suite-measures-this-harness

## Approach

Four small pieces, and the ordering matters: everything deterministic lands before the one step that
costs money, so the paid run measures a suite that is already correct.

`promiseSpecs()` in `.aidlc/lib/artifacts.mjs` answers B2's first question — status `approved`, or
`migrated_from` present. `approve()` keeps reading `status === 'approved'` and is not touched.
`evals/lib/campaign.mjs`'s `behavioursHaveTests` switches to `promiseSpecs()`, which takes its reach
from three of twenty-four specs to all of them. Expect it to report more; that is the point, and B4
says record what is true.

The three stale tasks in `evals/tasks.json` get their assertions repointed from
`.aidlc/artifacts/contracts/<name>.md` to `.aidlc/artifacts/*/spec.md` and `plan.md`. Before
rewriting each, confirm the property it names still exists in the three-file chain — testability,
`## Files` ownership, successor links — and if one does not, retire it loudly rather than relax it.

Ceilings come last among the deterministic work and are set from the 2026-09-04 run's measured
costs plus headroom, so the paid run in step 6 does not abort. `surgical-fix` measured $1.871
against a $0.75 ceiling; the ceiling was fitted to a harness that no longer exists.

`run.mjs`'s summary line gains the abort count beside the cost (B5), and `evals gate` compares
`expected.json`'s recorded `commit` against `HEAD` and says so when the artifact model moved between
them (B6). Both are a few lines, and both exist because the last run's summary read as good news.

Rejected: re-recording `expected.json` first and fixing the tasks afterwards. That records aborts
and stale assertions as the expectation, which is the failure B4 names.

Rejected: a `status: migrated` third state. It would need writing into twenty-three approved-then-
migrated artifacts, changing their digests, and it says nothing `migrated_from` does not already say.

## Files

- `.aidlc/lib/artifacts.mjs`
- `evals/lib/campaign.mjs`
- `evals/tasks.json`
- `evals/run.mjs`
- `evals/expected.json`
- `.aidlc/checks/eval-gate.mjs`
- `test/suite-truth.test.mjs`
- `.aidlc/artifacts/the-suite-measures-this-harness/`

## Order

1. `test/suite-truth.test.mjs` — B2: a spec with `migrated_from` and no approval is a promise and is
   not gateable; an `approved` spec is both; a draft is neither. Red first.
2. `.aidlc/lib/artifacts.mjs` — `promiseSpecs()`; `approve()` untouched.
3. `evals/lib/campaign.mjs` — `behavioursHaveTests` reads `promiseSpecs()`. Record what its reach
   becomes, in the commit.
4. `evals/tasks.json` — repoint the three tasks (B1), each checked against the chain first; and
   refit every `budgetUsd` from measured cost (B3).
5. `test/suite-truth.test.mjs` and `evals/run.mjs` — B5: the summary line carries the abort count;
   `.aidlc/checks/eval-gate.mjs` — B6: a baseline whose `commit` predates an artifact-model change
   is reported as incomparable, not as regressions.
6. Run the full suite. Separate the eleven moved tasks into stale assertion, budget, and real
   regression, and write that division into `.aidlc/artifacts/the-suite-measures-this-harness/`.
7. `evals/expected.json` — re-recorded from that run, `commit` and `recorded_at` written by the
   runner. A task still failing is recorded `fail`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/suite-truth.test.mjs` — the three repointed tasks validate, and each names a path the three-file chain produces |
| B2 | `test/suite-truth.test.mjs` — a `migrated_from` spec is a promise and is not gateable; approved is both; draft is neither |
| B3 | the step 6 run: no task exhausts its ceiling |
| B4 | the division recorded in `.aidlc/artifacts/the-suite-measures-this-harness/`, and `expected.json` carrying `fail` where a task still fails |
| B5 | `test/suite-truth.test.mjs` — a run with an aborted task prints the abort count beside the cost |
| B6 | `test/suite-truth.test.mjs` — a baseline whose `commit` predates an artifact-model change is reported incomparable |
