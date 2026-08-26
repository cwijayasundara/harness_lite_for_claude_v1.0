# Spec: linked-eval

- **Date:** 2026-08-24
- **Intent:** [.claude/artifacts/intent/linked-eval.md](../intent/linked-eval.md)
- **Status:** approved

## Behaviour

1. Fixture `linked-change` overlays `_base` with shipped `hyphen-titlecase` (approved intent, spec, plan, hyphen-aware `titlecase()`, and a hyphen test) plus `docs/req-b.md`.
2. `evals/tasks.json` contains `second-req-links-first` whose `steps` keep one workdir: write intent `family-sort-key` → commit approval → write spec → commit approval → write plan → commit approval → implement.
3. After the spec step, `.claude/artifacts/spec/family-sort-key.md` exists, contains `hyphen-titlecase`, and contains `## Out of scope`.
4. After implement, some `src/app/*.py` file defines `family_sort_key`, `src/app/text.py` is unchanged versus the fixture, `harness check --stage commit` passes, and the fixture tests still pass.
5. `approveDrafts` only mutates artifacts that are not in the pristine fixture, so `hyphen-titlecase` stays approved and untouched.
6. `validate()` accepts a task with `steps` instead of a top-level `prompt`, and rejects a step that is neither a prompt nor an approve of `intent|spec|plan`.
7. `--dry` multiplies the USD ceiling by the number of prompt steps. A do-nothing model still fails the task (rehearsal).

## Out of scope

- A new `harness_test` package or `node_modules`.
- Running the live model half in CI without credentials.
- Auto-approving product review.md (Gate 3).
- Changing `titlecase()` behaviour in the fixture.
- Raising skill/agent/hook budgets.

## Domain vocabulary

**Prompt step** — a `steps[]` entry with `prompt` that calls the invoker.
**Approve step** — a `steps[]` entry with `approve` that commits new draft artifacts as approved.
**Predecessor** — the shipped slug the second requirement must name (`hyphen-titlecase`).

## Constraints and invariants

- One workdir per attempt; cleanup still happens in `finally`.
- Fail the remaining steps once a prompt or approve step fails, so a broken intent does not spend the rest of the budget.
- Glob assertions stay one `*` per path segment (`src/app/*.py`, not `**`).

## Visual design

Not user-facing.

## Policy concerns flagged

Live evals spend ~four `claude -p` calls (~$3 ceiling at $0.75 each). Owner: whoever runs `--id second-req-links-first`.
