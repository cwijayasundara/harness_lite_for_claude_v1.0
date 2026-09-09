---
name: diagnose
description: Runs a disciplined bug and performance investigation — reproduce, isolate, diagnose, then fix — instead of guessing at edits. This skill should be used for any bug report, stack trace, flaky test, performance regression, or "it works locally but not in staging" problem, and whenever a fix has already been attempted once without success.
---

# Diagnose

## Phase 1 — build the loop. This is the skill.

Everything after this is mechanical. If you have a fast, deterministic, agent-runnable
pass/fail signal for the bug, you will find the cause. Spend disproportionate effort here.

Ranked, best first:

1. A failing unit test that reproduces it in under a second.
2. A failing integration test against a fixture.
3. A single command that exits non-zero on the bug (`bash .aidlc/bin/harness check ...`).
4. A script that drives the app and greps the log for the symptom.
5. A manual sequence you can repeat identically.

A 30-second flaky loop is barely better than no loop. A 2-second deterministic loop is a
debugging superpower. If you cannot build a loop, record what is missing, gather available evidence and ask only for
information or access that blocks diagnosis. Do not guess at a fix.

## Phase 2 — isolate

Bisect. Halve the surface each time: which layer, which input, which commit
(`git bisect run <your loop>` is the whole point of having a loop).
Write down what you ruled out — it stops you re-testing the same hypothesis twice.

## Phase 3 — diagnose

State the cause in one sentence, and state why it produces exactly this symptom and not a
different one. If you cannot, you have found *a* problem, not *the* problem.

## Phase 4 — fix

Use the reproduction as a regression check, then fix the cause in a small slice. Exercise the
affected runtime path and nearby failure cases. Maintain tests when the approved behaviour or
a test defect requires it, explaining the change without weakening the regression proof.
Existing test locks and external evaluation fixtures remain protected; the owner decides any
lock change. Report the observed result and any uncertainty.

For a production incident or control-band breach, first create
`.aidlc/artifacts/incident/<slug>.md` with `harness new incident <slug>`. Preserve the metric,
baseline, breached band, timeline, and mitigation. Then create the linked intent with the same
slug. When the fix ships, add one permanent eval reproducing the incident class.
