# Remediation plan — the 22 findings

Written 2026-09-05, after the owner's note that testing took five hours and the integration test
must run in under thirty minutes.

## The integration test, settled

It already exists and is measured. `campaign-ledger`: 3 sprints, 9 minutes, $0.95.
`campaign-legacy`: 2 sprints, 6 minutes, $0.85. **Five sprints, two codebases, 15 minutes, $1.79,
unattended.** `lean-v2` B13 is amended to name this rather than eight features of `dunning`.

The five hours went to human approval round-trips, building the campaign machinery, and an
85-minute full eval suite. None of those is the integration test, and none needs repeating.

**Standing command**, once the gate fixes below land:

    node evals/run.mjs --id campaign-ledger --require-auth && node evals/run.mjs --id campaign-legacy --require-auth

## Closed already (6)

F1, F6, F7 — unattended gates, delivery channel, artifact layout. Fixed by
`campaigns-run-unattended`, reviewed and approved.
F2 — the dead-end refusal that sent an agent hunting for `require_contract`; F12 records the same
scenario now producing three artifacts and a clean adoption.
F8, F12 — passes, recorded so the suite is trusted when it is green.

## Priority 1 — the two campaigns cannot pass until these land (≈1 change each)

Both campaigns currently fail for real reasons, and an integration test that cannot go green is not
one. These are the whole of the gap.

**P1.1 — F9, F10: supersession.** `campaign-ledger` sprint 3 fails B5. Change
`a-spec-can-be-superseded` is written, both gates approved, plan committed. Six behaviours, ready to
implement. F10 (a sprint changing product behaviour under a previous sprint's contract) stays out of
scope by its spec — observed once.

**P1.2 — F14, F17: the gates check state, never content.** `campaign-legacy` sprint 2 fails B6
because an approved plan proved none of its four behaviours. Change `a-plan-proves-its-spec` is
written, both gates approved, plan committed. Six behaviours, ready to implement. F17 (a template
approved verbatim, twice, once putting `path/to/file` into an ownership declaration) is folded in.

After these two, re-run both campaigns. That is the 15-minute test, and it should be green.

## Priority 2 — the suite is not measuring this harness (1 change, cheap)

**P2 — F18, F19, F16.** One omission seen three times: `lean-v2` migrated the artifact model and
nothing downstream was re-checked.

- F18: three golden tasks assert `.aidlc/artifacts/contracts/`, deleted by the migration. They have
  failed for two days. `expected.json` predates the migration, so `harness evals gate` compares a
  post-migration harness to a pre-migration baseline.
- F19: cost per task roughly quadrupled — `surgical-fix` $0.38 → $1.87 — because a task that wrote
  one contract now writes three artifacts and approves twice. Four tasks blow a $0.75 ceiling. The
  run got *cheaper* while the pass rate collapsed, which reads as good news on the summary line.
- F16: only three of twenty-four specs read `approved`, so every `approved`-keyed control, B6
  included, inspects 13% of the repository.

Fix together: repoint the three tasks at the three-file chain, refit `budgetUsd` to measured cost,
re-record `expected.json`, and decide what `approved` means for a migrated change. Deterministic
apart from the re-baseline run.

## Priority 3 — real, not blocking (small changes)

- **F4, F13** — transcript assertions grade an agent's closing message, in words of its own
  choosing. Three failures from this: a regex satisfiable by echoing the prompt, an agent that said
  "evolves", and a British spelling. Assertions about behaviour should read the working copy.
  `evals/tasks.json:69` still carries the spelling bug, deliberately untouched.
- **F22** — `scope-drift` counts untracked files nobody touched, and its remedy would put
  `.DS_Store` into an ownership declaration. Add `.DS_Store` to the `gitignore` template; make the
  remedy text conditional.
- **F3** — product code reached `catalog.py` with no plan while seven Edits were denied. Needs
  investigation before it earns a fix; the staged directory is gone, so reproduce first.
- **F5** — `file_exists` on the artifact glob passes on a scaffold. Assert content, not existence.
- **F20** — `dunning` cannot pass `stop` before its first file. Same shape the evaluator caught in
  `campaign-ledger`; resolves once source exists.
- **F21** — `dunning`'s `package.json` says CommonJS, its `tsconfig.json` is configured for ESM.
  Owned by the example app, not the harness. Fix before F2 or every later change hits it.

## Not fixed, deliberately

- **F11, F15** — every plan an agent writes proves behaviours with prose rather than a resolvable
  test. This is why `a-plan-proves-its-spec` B2 asserts presence only. Demanding a resolvable test
  would refuse every plan at the moment plans are approved.
- **F10** — ownership needing a purpose as well as a path. Observed once. Guessing is what Law 11
  exists to prevent.

## Sequence

1. Implement `a-spec-can-be-superseded` and `a-plan-proves-its-spec`. Both are approved at both
   gates; no further human input needed.
2. Run the 15-minute campaign suite. Green is the exit condition.
3. P2 as one change, ending in a re-recorded `expected.json`.
4. P3 as small independent changes.

Steps 1 and 2 are what "the integration test completes in under thirty minutes" requires. Everything
after is maintenance.
