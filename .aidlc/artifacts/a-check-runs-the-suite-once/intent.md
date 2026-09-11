---
status: draft
source: docs/DEFECT-REPAIR-PLAN.md
source_revision: 62fea335060175a6327494e6abe04cb37d3c94e4
---
# Intent: a-check-runs-the-suite-once

- **Date:** 2026-09-10
- **Author:** cwijayasundara
- **Source:** `docs/DEFECT-REPAIR-PLAN.md` item D2, filed at the bound `source_revision`. Backlog
  item F04.

## Problem

**The commit check runs the whole test suite twice, and the second run is invisible.**

`[stages]` in `.aidlc/harness.toml` defines
`commit = ["stop", "scope-drift", "budget", "tamper", "arch", "test_quality", "baseline"]`. `stop`
expands to `secrets` plus the full `node --test` suite, so by the time `baseline` starts, the suite
has already run to completion in the same process. `.aidlc/checks/baseline.mjs` then calls
`baseline.capture(cfg)`, and `capture()` runs it again:

```js
const report = await check(cfg, { stage: 'stop', files: [], write: false, all: true });
```

`.aidlc/lib/baseline.mjs:40`. The result of the first run is still in the same process; nothing
consults it.

**Evidence, measured on this machine on 2026-09-10.** A full `harness check --stage commit` on a
green tree:

| Control | Elapsed |
|---|---|
| `test` | 95,311 ms |
| `baseline` | 77,054 ms |

The `baseline` control does almost nothing of its own — it estimates tokens over a rendered report
and reads an index — so nearly all of those 77 seconds are a second execution of the suite the
`test` verb had just finished. Both figures above were taken while an unrelated model call was
running on the same machine and are inflated; an isolated `--stage stop` on the same tree measured
`test` at 65,929 ms, close to the 65,325 ms recorded in the source document. The ratio is what
matters and it is stable: roughly a minute of every commit check recomputes a result the process
already has.

**It also reads as a hang.** The control emits no progress while it does this, so the operator
sees the run stop dead after `test_quality` for over a minute with no output.

## Proposed outcome

One `harness check --stage commit` executes the test suite exactly once.

Observable from outside the system:

- A configured `test` command that counts its own invocations is invoked once per commit-stage run.
- The commit stage returns roughly a suite-length faster on the same workload, measured before and
  after on the same machine.
- `check_stop_tokens` still grades the same thing, and the ratchet does not fire because of this
  change.
- A failing suite still fails the commit stage, and `harness baseline check` standalone still runs
  its own stop stage, because it has no in-flight run to borrow from.

## Affected users and systems

- `.aidlc/lib/runner.mjs` — `runOne` calls `mod.run(cfg, files)`; the in-flight results are held by
  `check()` and are not passed down.
- `.aidlc/lib/baseline.mjs` — `capture()` owns the second `check()` call.
- `.aidlc/checks/baseline.mjs` — the control that calls `capture()` inside a run.
- Everyone who runs a commit check, and every verification run during the building of D3.
- `a-baseline-measures-what-ships`, whose approved plan already names `.aidlc/lib/baseline.mjs`,
  `.aidlc/checks/baseline.mjs`, `.aidlc/lib/runner.mjs`, `.aidlc/harness.toml` and
  `.aidlc/baseline.json`. See the open questions.

## Constraints

- **The metric must keep measuring the same thing.** `check_stop_tokens` is
  `estimateTokens(render(report))`. If the reconstructed report renders differently, the number
  moves and the ratchet fires against the recorded baseline for a reason unrelated to any change.
  The tolerance is 1.10 and is not to be widened; `the-gate-grades-what-it-can-measure` already had
  that argument.
- Reuse is only sound where the two are equivalent. `capture()` passes `all: true` so fail-fast
  cannot truncate its measurement; inside a commit run `baseline` is reached only when every
  earlier verb passed, so nothing was truncated. If an earlier verb had failed, fail-fast would
  have stopped the run before `baseline`.
- `capture()` keeps its own `check()` call for the standalone `harness baseline capture` and
  `harness baseline check` paths, which have no run to borrow from.
- Zero dependencies. `[limits]` unchanged. No new control — this is a defect in harness machinery,
  which Law 11 says earns a fix and not a new control.
- No model call anywhere in this item.

## Open questions

Three decisions are consequential enough to belong to the human, each with a recommendation.

1. **"Byte for byte" cannot be the acceptance test, and the source document asks for it.** D2 says
   to compare the two renderings byte for byte on a green tree. That comparison can never succeed:
   `render()` at `.aidlc/lib/runner.mjs:209` writes each control's elapsed milliseconds into the
   rendered string, and two runs of an identical green tree therefore never render identically —
   this session measured the same suite at 65,929 ms and at 95,311 ms. The recommendation is to
   replace byte-equality with a structural comparison: identical controls, verdicts, findings,
   notes, errors and ordering, with `ms` normalised out. That is deterministic and testable;
   byte-equality is neither. It also shows the metric was already mildly non-deterministic, since
   a timing that crosses an order of magnitude changes the estimate — which is one thing the 1.10
   tolerance has been absorbing.

2. **What exactly is reconstructed.** The commit stage's in-flight results are a superset of
   `stop`: they also hold `scope-drift`, `budget`, `tamper`, `arch` and `test_quality`, and a run
   invoked with `--base`/`--candidate` adds a `candidate ... from ...` line at
   `.aidlc/lib/runner.mjs:206`. Reusing the commit report wholesale would change
   `check_stop_tokens` outright. The recommendation is to reconstruct a stop-shaped report by
   filtering the in-flight results to the verbs `resolveStage(cfg, 'stop')` names, preserving
   their order, and to carry no revision line.

3. **Ownership overlap with `a-baseline-measures-what-ships`.** That change is approved and not yet
   implemented, and its `## Files` already claim every file this one needs. Its five behaviours are
   about `session_context_tokens` — the SessionStart payload being measured as a 52-token
   reconstruction rather than the real 649 — and none of them touch the duplicate suite run, so the
   two do not contradict each other. The recommendation is to serialize, land this one first
   because it is far smaller, and for this change not to touch `.aidlc/baseline.json` at all, which
   the answer to question 1 makes possible. Which change owns those files is the human's decision.
