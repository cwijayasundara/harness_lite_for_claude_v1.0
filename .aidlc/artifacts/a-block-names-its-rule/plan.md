---
status: draft
depends_on: retire-change-safely
---
# Plan: a-block-names-its-rule

## Approach

One line in the runner, a return shape in the guard, and the callers that follow
from it.

`.aidlc/lib/runner.mjs` builds the ledger row from each control's result and
already holds its findings; the row takes `rule` from the first finding that
names one. That covers `test`, `scope-drift` and `tamper` in one place, and any
check that tags its findings later, which is why it is preferred over editing
three checks separately.

`writeBlocked` in `.aidlc/lib/guard.mjs` returns a refusal string today. It
returns the refusal with a name, and `.aidlc/hooks/dispatch.mjs` passes the name
to `ledger.append`. `test/guard.test.mjs` asserts on the refusal text in several
places and is updated to read the message from the new shape, keeping every
assertion it makes today.

Each behaviour is proved red before it is green: a test asserting a `scope-drift`
block records its rule fails against the current runner, and one asserting a
refused write records which refusal fired fails against the current guard. B4 is
a lock over the surface this change must not disturb, and
`test/ledger-evidence.test.mjs` passing unedited is part of its proof.

`depends_on: retire-change-safely` records that both changes edit
`docs/IMPROVEMENT-PLAN.md`; they are serialized rather than merged, and this one
goes second.

## Files

- `.aidlc/lib/runner.mjs`
- `.aidlc/lib/guard.mjs`
- `.aidlc/hooks/dispatch.mjs`
- `test/guard.test.mjs`
- `test/block-rules.test.mjs`
- `docs/IMPROVEMENT-PLAN.md`

## Dependencies

| Change | Interface | Revision |
|---|---|---|
| retire-change-safely | docs/IMPROVEMENT-PLAN.md | 39b65553686aee3f50828f7e6106a0eb87e1278f |

## Order

1. Add `test/block-rules.test.mjs` with the B1–B4 assertions. Confirm B1 and B2
   fail against the current runner and guard, and that B4 passes.
2. Take the rule from the first tagged finding when appending a control's row in
   `.aidlc/lib/runner.mjs`, reading defensively so an absent or untagged finding
   records no rule and never throws. Confirm B1 goes green.
3. Return the refusal name alongside the message from `writeBlocked` in
   `.aidlc/lib/guard.mjs`, naming at least the protected-path and
   outside-approved-scope refusals.
4. Pass that name into the `write-guard` row in `.aidlc/hooks/dispatch.mjs`, and
   keep the refusal text reaching the agent unchanged. Confirm B2 goes green.
5. Update `test/guard.test.mjs` call sites to read the message from the new
   shape, preserving every assertion.
6. Record in the lean-review ledger row in `docs/IMPROVEMENT-PLAN.md` that the
   recommendation was taken and when, keeping the investigation's figures as the
   dated snapshot they are.
7. Run `harness check --stage stop`, then `--stage commit`, and confirm
   `test/ledger-evidence.test.mjs` passes unedited.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/block-rules.test.mjs`: a run whose `scope-drift` and `tamper` checks fail appends rows carrying those checks' own rule names, a failing suite records `test-failed`, a control reporting several rules records the first, and one reporting none records none |
| B2 | `test/block-rules.test.mjs`: a refused write to a protected agent-instruction path and a refused write outside the current change's scope append rows naming different rules, the refusal text reaching the agent is unchanged, and a permitted write appends a passing row with no rule |
| B3 | `test/block-rules.test.mjs`: `harness ledger flag <rule>` marks a row recorded under B1 and under B2, setting only `false` and leaving verdict, rule, timestamp and run intact, and `harness ledger audit` reports those rules with fire and false counts under their control; `test/unit.test.mjs` keeps proving the noisy threshold |
| B4 | `test/block-rules.test.mjs`: passing rows carry no rule and the row keys are otherwise unchanged; `test/ledger-evidence.test.mjs` passes unedited, holding the thresholds, verdict set, subcommands and the absence of any benefit field; `test/guard.test.mjs` keeps proving every refusal it proves today |

## Gate status

Prepared for review. Spec and plan remain drafts. Implementation starts after
the user's `harness approve` of spec, then plan.
