---
status: approved
source_digest: sha256:4e5ca318f767e590e24961b313042fb6c3cae006d0bab78e74a77b35fd0be843
source: docs/IMPROVEMENT-PLAN.md
source_revision: b5c4c2fc2329b48b31b97cbcb8859bf60d36f9ae
source_kind: repository
intent_digest: sha256:e0f65e9a36f451c248c77f08a9ef00b956c270250112777f77e96c7c6a4f28f5
intent_input_digest: sha256:a39baeb67459d56c2dcf5d1e2c728a154ebf6d83e0cfcff428bc1aa764107e8b
intent_revision: 4c3433f0ddbe66221df2166b810b03c93ee0ecf8
by: cwijayasundara
at: 2026-09-09T13:36:32.968Z
digest: sha256:89ca9ddb2f8880bc3a49aeef1cbb01330a71593b7416d86cbbb22913960ea6ff
approval_version: 2
approval_digest: sha256:d5a77f5b685a6cd0780450fb5bdd77e4915d88be17b73a3192fa6f85bd40d063
---
# Spec: a-baseline-measures-what-ships

## Outcome

The deterministic token surface the harness controls is measured as the harness actually emits
it, from the one code path that emits it, and a regression in that measurement fails a gate
without anyone choosing to run a verb.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| local:baseline-measures-the-real-payload | B1, B2 |
| local:the-ratchet-is-pulled-by-a-gate | B3 |
| local:the-record-matches-its-schema | B4, B5 |

## Observable behaviours

### B1

Given a repository with a built index and artifacts on disk,
When `harness baseline capture` runs,
Then the recorded `session_context_tokens` equals `estimateTokens` of the exact string the
SessionStart hook writes to `additionalContext` for that repository state — including the map
summary, the hubs line, the contract line, the current-change line and every `superseded:` line —
and not a four-line reconstruction of it. On this repository at the change's base commit the
recorded figure is within one token of the 649 measured on 2026-09-09, rather than 52.

### B2

Given the SessionStart payload,
When both `dispatch.mjs` and `baseline.mjs` need it,
Then exactly one function assembles it and both call that function. Adding a line to the payload
changes one place. A test fails if the assembled payload and the measured payload are produced by
two different code paths, so the defect this change fixes cannot reappear in a new location.

### B3

Given `harness check --stage commit`,
When the deterministic context surface has grown beyond the recorded tolerance,
Then the stage fails, and the rendered output names the metric, the recorded figure and the
current figure, in the same shape every other control reports a finding. A run within tolerance
reports `PASS`. `harness baseline check` continues to work as a verb, and reports the same
verdict as the gate.

### B4

Given `.aidlc/baseline.json`,
When it is read by `harness baseline check`,
Then it contains the metrics the current `capture()` produces and no retired key. `wiki_index_tokens`
is absent. A key present in the file that `capture()` does not produce is reported rather than
silently ignored, so a file that has drifted from its schema is visible instead of graded.

### B5

Given a capture taken after B1 lands,
When the recorded `session_context_tokens` moves from 52 to roughly 649,
Then the record states that the movement is a corrected measurement of an unchanged payload and
names the commit at which the correction was made. The gate does not report it as a regression,
and `captured_at` is the date the figures were taken.

## Design

`dispatch.mjs`'s `session-start` case builds an array of lines and joins it. That array
construction moves into a function — `sessionContext(cfg)` — in the module that already owns the
harness's shared runtime reads, and `dispatch.mjs` calls it and writes the result. `baseline.mjs`
`capture()` calls the same function and estimates its tokens. This is B2, and it is the whole of
the fix: the synthetic four-line block at `baseline.mjs:30-35` is deleted rather than corrected,
because a corrected second implementation is still a second implementation.

The gate is a control named `baseline`, registered in `runner.mjs`'s check registry beside
`secrets`, `scope-drift`, `budget` and `tamper`, and added to `[stages] commit`. It is a thin
adapter over `lib/baseline.mjs`: load, capture, compare, and return `compare()`'s regressed rows
as findings. No `[limits]` entry is affected — `skills`, `agents`, `hooks`, `hook_loc` and
`claude_md_lines` are all unchanged — and no new measurement is invented. The ratchet already
exists and is already written; it has never had a gate.

The rejected alternative is folding the comparison into the existing `budget` control, which
avoids a sixth commit control and a new module. It is rejected because a ceiling and a ratchet
produce different verdicts from different evidence — `budget` fails at an absolute limit a human
set, `baseline` fails at a relative rise against a recorded observation — and the repository's
own rule is that every fire names the rule that fired it. Merged, a `commit` failure could not
say which of the two it was without re-deriving it.

B4 is a schema assertion in `compare()`, not a migration: an unknown key is reported, never
dropped, so the file is corrected by `capture` rather than by a hand edit.

## Out of scope

- Changing what the SessionStart payload contains. The `superseded:` list is 76% of it and grows
  without bound; whether it stays, is capped, or moves behind `harness status` is the intent's
  first open question and the human's decision. This change makes the cost visible and gated. It
  does not spend it.
- The model-side half of the cost surface — output tokens and USD per change. That is filled by
  the eval suite's `under_baseline` assertion when it runs with a key, and it is untouched here.
- The graph, the map, `harness pack`, and the code property graph work. Separate change.
- Backfilling historical baselines, in this repository or in consuming projects.
- Raising, lowering or reinterpreting any `[limits]` value.

## Safeguards

- `.aidlc/baseline.json` is regenerated by `harness baseline capture` and never hand-edited; B4
  makes a hand edit that adds an unknown key visible rather than silently graded.
- `evals/fixtures/` is untouched.
- B5 keeps the correction legible, so the first gated run cannot be read as a regression and
  cannot be used to argue the tolerance should be raised.
- `compare()`'s existing `ENVIRONMENT_SENSITIVE` handling for `check_stop_tokens` is unchanged, so
  a machine missing a tool still skips that metric instead of failing on its own toolchain.
- The tolerance stays at the recorded 1.10. This change does not adjust it to accommodate itself.
- `harness baseline check` keeps working as a verb, so the gate adds a caller rather than
  replacing the existing surface, and `test/host-evidence.test.mjs`'s verb list is unchanged.
