# Plan: linked-eval

- **Date:** 2026-08-24
- **Spec:** [.claude/artifacts/spec/linked-eval.md](../spec/linked-eval.md)
- **Risk tier:** low
- **Status:** approved

## Files

```
.claude/evals/run.mjs
.claude/evals/lib/approve.mjs
.claude/evals/tasks.json
.claude/evals/README.md
.claude/test/evals.test.mjs
.claude/test/plan-drift.test.mjs
.claude/checks/plan-drift.mjs
.claude/lib/runner.mjs
.claude/test/unit.test.mjs
.claude/evals/fixtures/_base/.claude/harness.toml
.claude/evals/fixtures/linked-change/
.claude-plugin/marketplace.json
.claude/test/contracts.test.mjs
README.md
.claude/docs/OPERATING.md
.claude/docs/BUILD-PLAN.md
.claude/templates/CODEOWNERS
.github/workflows/harness.yml
plugins/
.claude/artifacts/intent/linked-eval.md
.claude/artifacts/spec/linked-eval.md
.claude/artifacts/plan/linked-eval.md
```

## Order of work

1. `approveDrafts` plus tests that it commits only new drafts.
2. `steps` in `run.mjs` / `validate` / `promptCount`, with a fake-invoker test that the spec step sees the approved intent.
3. `linked-change` fixture (req A shipped + `docs/req-b.md`).
4. `second-req-links-first` task and README.

## Proof

| Spec behaviour | Test |
|---|---|
| 1. | `fixtures are what they claim: linked-change is green` + staged pytest 4 passed |
| 2–4. | `evals/tasks.json` task `second-req-links-first`; live run is model-in-the-loop |
| 5. | `approveDrafts commits a new draft and leaves fixture artifacts alone` |
| 6. | `validate accepts a multi-step task and rejects a step that is neither prompt nor approve` |
| 7. | `no eval task is satisfied by a model that does nothing`; `run.mjs --dry` prints 21 tasks |

## Risks

| Risk | Mitigation |
|---|---|
| Vacuous pass if commit-stage is empty | Last step also requires `def family_sort_key` |
| `plan-drift` grades B against A's plan | Approve step commits B's plan before implement |
| `**` glob does not recurse | Assertions use `src/app/*.py` |
