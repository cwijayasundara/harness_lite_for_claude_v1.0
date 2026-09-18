---
status: closed
---
# Intent: an-unattended-turn-does-not-end-on-a-question

- **Date:** 2026-09-06
- **Author:** cwijayasundara
- **Source:** `.aidlc/artifacts/one-integration-test/evidence.md` F34 — the second instance of
  F23, on run 5 of the five-sprint integration test.

## Problem

Sprint 5 was refused its first product write, correctly, started the chain, wrote an intent,
and ended its turn with "Does this intent match what you want?". The `intent` skill's last step
is "Stop. Ask the person to accept it." The unattended notice at session start says there is no
person and not to ask. Two instructions disagreed and the later, more specific one won, which
is what F6, F7, F26 and F30 each recorded in their own way: instruction does not steer against
instruction.

The run had four sprints green and one product file to write. It ended with the file unwritten,
an intent nobody will accept, and $0.09 spent on the sprint.

## Proposed outcome

Under `AIDLC_UNATTENDED`, a turn cannot end while the chain holds work that is declared and not
gated — an intent with a scaffold spec, a written spec awaiting approval, an edited approval —
without being sent back once, with the reason and the next command. A human session is
untouched: the Stop hook blocks nothing when a human is present.

## Affected users and systems

- The `stop` action in `.aidlc/hooks/dispatch.mjs`, which already runs at every Stop.
- `draftsAwaitingGate()` in `.aidlc/lib/artifacts.mjs`, which needs one more entry kind: an
  open change with an intent and a spec still at the scaffold.
- `.aidlc/skills/intent/SKILL.md`, whose last step gains the unattended clause so the skill and
  the hook say the same thing.
- The campaign runner, which is the only thing that sets `AIDLC_UNATTENDED`.

## Constraints

- Once per session. A second Stop with the same work still waiting ends the turn, so a run can
  never loop on its own refusal; the budget cap is not the loop guard.
- No new hook binding: `stop` already fires. Skills stay 7/7.
- Nothing changes for an attended session: the block is gated on the environment variable the
  runner sets and strips, the same signal `approve()` trusts.
- Law 11: second instance of one defect on the campaign.

## Open questions

- None. Claude Code's Stop hook returns `{ "decision": "block", "reason": … }` and the input
  carries `stop_hook_active` when a turn is already continuing from a block; both are documented
  and the plan uses them.
