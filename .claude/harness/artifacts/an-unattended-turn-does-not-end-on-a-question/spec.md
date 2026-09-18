---
status: approved
extends: one-integration-test, the-suite-measures-this-harness
by: cwijayasundara
at: 2026-09-06T08:14:07.640Z
digest: sha256:4d397b7aa619daabd5cb909976895d9261e9c3fd0670e9e8be460517bc8841d6
---
# Spec: an-unattended-turn-does-not-end-on-a-question

## Outcome

An unattended run that has declared work and stopped short of its gate is sent back to it once,
with the reason, instead of ending on a question nobody answers.

## Observable behaviours

### B1 — an intent without a spec is declared work

Given an open change whose `intent.md` is not the scaffold and whose `spec.md` is absent or
still the scaffold,
When `draftsAwaitingGate()` runs,
Then it lists the change with `kind: 'spec'` and `reason: 'unwritten'`, and the shared wording
reads `awaiting gate 1: <slug> (intent written, spec not yet)`. The guard and `scope-drift`
refuse product writes for it exactly as for a written draft.

### B2 — a scaffold intent declares nothing

Given an open change whose `intent.md` still carries the template's placeholders,
When `draftsAwaitingGate()` runs,
Then it is not listed. `harness new` alone blocks nothing.

### B3 — under unattended, Stop is refused once while work waits

Given `AIDLC_UNATTENDED` is set and `draftsAwaitingGate()` is non-empty,
When the `stop` hook runs with `stop_hook_active` false,
Then it emits `{ "decision": "block", "reason": <text> }` where the text names the waiting
change and the next command, and says nobody will answer a question. The ledger records a
`stop-guard` row with `verdict: fail`.

### B4 — the second Stop ends the turn

Given the same state,
When the `stop` hook runs with `stop_hook_active` true,
Then it emits no block and records a `stop-guard` row with `verdict: pass` and
`rule: 'let-through'`. A run cannot loop on its own refusal.

### B5 — an attended session is untouched

Given `AIDLC_UNATTENDED` is not set,
When the `stop` hook runs with work waiting,
Then it emits no block and records nothing under `stop-guard`.

### B6 — the skill says the same thing

Given `.aidlc/skills/intent/SKILL.md`,
When its last step is read,
Then it says to ask the person to accept the intent, and that under an unattended run there is
no person: go on to the spec and record the decision there.

### B7 — the campaign proves it

Given `campaign-ledger` sprint 5 under the unattended runner,
When the agent writes an intent and stops to ask,
Then the Stop is refused once with the reason, and the sprint ends with `docs/PRODUCT.md`
written under its own approved plan.

## Out of scope

- Blocking a Stop for any other reason (a red `stop` stage, a stale map). Those stay notes.
- Attended sessions, in every case.

## Safeguards

- The block fires only with `AIDLC_UNATTENDED` in the hook's own environment, which the runner
  sets for campaign steps and strips for everything else.
- `stop_hook_active` is the loop guard, and B4 tests it.
- The existing Stop behaviour — refresh, `stop` stage, map-drift — runs unchanged in both cases.
- `test/map-drift.test.mjs`, which drives the Stop hook, passes unchanged.
