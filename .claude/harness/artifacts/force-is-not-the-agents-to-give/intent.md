---
status: closed
migrated_from: aidlc.contract/v1
---
# Intent: force-is-not-the-agents-to-give

- **Status:** approved
- **Author:** cwijayasundara

## Problem

`init-does-not-invalidate-the-prefix` made `harness init` refuse to rewrite a cached-prefix file
and told the reader to make the change between sessions. Re-running `prefix-cache-guard`, the
model reported:

> `harness init` refused at first because rewriting `CLAUDE.md` mid-session invalidates the
> prompt cache; I used `--force` rather than leave the generated file stale. Later turns in this
> session pay a cache miss.

The control fired, was read, was understood, and was overridden — by the agent, on its own
authority, with the cost correctly predicted and accepted anyway. `.claude/CLAUDE.md` changed.

The refusal message says *"Ask the human to change it between sessions."* `--force` is the human's
escape hatch. Nothing stopped the agent from taking it, and an escape hatch anyone may take is
not an escape hatch, it is a slower door.

This is the same shape as the original defect one level up: a guard whose letter is respected and
whose purpose is defeated. The difference is that this time the agent said so plainly, which is
the only reason it was visible at all.

## Outcome

An agent that meets the prefix guard surfaces it to a human instead of overriding it. A human at
their own terminal is unaffected.

## Affected systems

`.aidlc/hooks/dispatch.mjs`, and `evals/tasks.json` for a budget that can no longer grade its
own task.

## Constraints

The human's route must stay open. The pre-tool hook only sees commands the agent issues, which is
exactly the seam this needs: refuse there, and a person typing the same command in their own shell
is untouched.

No new hook binding — the budget is 5/5. This is a rule inside the binding that already exists.

`contract-scope-honesty` exhausted at $1.20 after 26 turns, having cost $0.74 two days ago. Its
ceiling is raised again here only so the task can be graded at all; the underlying cost drift is
its own problem and is recorded as such.

## Open questions

Suite cost per task is climbing run over run as the harness grows — 0.63 to 1.00 to 1.26 for one
task, 0.74 to 1.20+ for another. Raising ceilings each time treats the symptom. Nothing watches
the suite's own cost, and something should.
