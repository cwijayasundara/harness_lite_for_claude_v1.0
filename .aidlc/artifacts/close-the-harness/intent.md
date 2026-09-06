---
status: draft
---
# Intent: close-the-harness

- **Date:** 2026-09-06
- **Author:** cwijayasundara
- **Source:** the four findings left open at the end of the 2026-09-06 program —
  `one-integration-test/evidence.md` F35 and `the-suite-measures-this-harness/evidence.md` F37,
  F38 and the three interview tasks — and the owner's decision the same evening to close the
  harness improvements in one change.

## Problem

The program left the harness with every phase closed and four findings named but not fixed.
Three are gates a campaign or a golden task walked through:

- **F37.** In an attended session an agent can run `harness approve` itself. The
  `contract-scope-honesty` task did exactly that: refused at a file outside its plan, it created
  a change, approved its own spec and plan with `--by`, and made the edit. Every gate built this
  week is a tool call away in a normal session.
- **F38.** The registry is a product file to the guard, so an agent with a plan naming it can
  edit `.aidlc/harness.toml`. The `sensor-consulted` task did, for no reason it could name.
- **F35.** An approved spec can be amended with new behaviours and re-approved, and its earlier
  `extends:` line answers the relation gate for it. Run 6 of the campaign reversed a promise that
  way.

The fourth is three golden tasks that start an intent and expect files, while the `intent`
skill interviews first; the one task that says "you have everything, do not ask" passes.

And the campaign has never been fully green. Its last run reached sprint 5 and failed only on
wording assertions that have since been repointed to the fact.

## Proposed outcome

One change lands the three gates and the three prompts, one campaign run and one full-suite
run record the result, `docs/PROGRAM.md` is deleted as its header says, and the harness
improvements are closed. Whatever that run shows is the closing evidence; no further change is
opened from it in this program.

## Affected users and systems

- `.aidlc/hooks/dispatch.mjs` (F37), `.aidlc/lib/config.mjs` (F38),
  `.aidlc/lib/artifacts.mjs` (F35), `evals/tasks.json` (the prompts), `evals/expected.json`
  (the re-record), and their tests.
- Any agent session in any installed repository: approval is the human's, and the registry is
  protected, from this change on.

## Constraints

- No new skill, hook binding or verb.
- F37 must not fire under `AIDLC_UNATTENDED`, where the runner has made the agent its own
  approver on purpose, and must never touch a human's own shell, which runs no hook.
- F38 protects the registry by default in every installed repository, and a plan that names it
  still may change it, as the protected-path rule already allows.
- F35 compares heading sets against the committed approved text; prose edits and removals stay
  allowed.
- One campaign run and one full-suite run, then stop.

## Open questions

- None that block the spec.
