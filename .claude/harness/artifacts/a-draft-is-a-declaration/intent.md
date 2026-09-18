---
status: closed
---
# Intent: a-draft-is-a-declaration

- **Date:** 2026-09-06
- **Author:** cwijayasundara
- **Source:** `.aidlc/artifacts/one-integration-test/evidence.md` F30 — the fourth instance of
  F10, found on the first five-sprint run of the integration test.

## Problem

`a-diff-belongs-to-one-change` made the current change the open change whose spec was approved
most recently, and made its plan the only plan that permits a product write. That closed two
routes: a refused plan's work proceeding on an older plan (F26), and a closed change's plan
authorising an edit (F10, second instance).

Sprint 3 of `campaign-ledger` found the third route. The agent created a new change, wrote a
real spec and plan for it, approved neither, and edited `src/ledger.mjs`. The write went through
because sprint 2's change was still open and still the most recently approved, and its plan owns
that file. The gate was not refused and not routed around; it was never reached. The agent had
declared new work in the only way the chain recognises — a spec with content — and the harness
treated the declaration as nothing.

Two instructions already say what should have happened: the `implement` skill's last step closes
a delivered change, and the unattended notice tells the agent to approve its own gates. Neither
was followed. `evidence.md` F6, F7 and F26 are the same lesson three times: an instruction that
waits to be followed steers nobody, and only structure does.

## Proposed outcome

Writing a spec is declaring the work. An open change whose spec has real content and no approval
blocks every product write, naming itself, until it is approved or closed. An untouched scaffold
declares nothing.

## Affected users and systems

- `currentChange()` and `governingPlans()` in `.aidlc/lib/artifacts.mjs`, and through them the
  write guard and `scope-drift`.
- `harness status` and `SessionStart`, which must name the blocking draft.
- Every repository with a backlog of `harness new` scaffolds, which must not be blocked by them.

## Constraints

- No new skill, no new hook binding, no new verb. Approve and close are the two acts that exist.
- A scaffold left by `harness new` with the template's placeholders still in it is a backlog
  item, not a declaration. `a-plan-proves-its-spec` already tells the two apart.
- The refusal names the drafted change and the two ways forward. It never names the switch.
- Law 11: one recorded defect from the non-harness workload, its fourth instance. That earns a
  rule about drafts and nothing wider.

## Open questions

- **Several drafted specs at once.** A human who drafts three specs in one sitting, as the owner
  did on 2026-09-06, would be blocked until the first is approved. Answered by the spec: that is
  gate 1 working, and the refusal says which drafts are waiting.
