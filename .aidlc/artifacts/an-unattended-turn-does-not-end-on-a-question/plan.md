---
status: draft
---
# Plan: an-unattended-turn-does-not-end-on-a-question

## Approach

`draftsAwaitingGate()` gains the third entry kind: intent not a scaffold
(`templateMarkers('intent', body)` empty) and spec absent or a scaffold. `awaitingGateLine` and
`awaitingGateRemedy` word it. Because the guard and `scope-drift` already read the list, B1's
refusal costs no code there.

The `stop` action, before its `graphDirty` early return: if `process.env.AIDLC_UNATTENDED` and
the list is non-empty, then if `input.stop_hook_active` is falsy write
`{ decision: 'block', reason }` to stdout, record `stop-guard fail`, and return 0; else record
`stop-guard pass` with `rule: 'let-through'` and continue as today. The reason is the
`awaitingGateRemedy` of the first entry plus the F23 sentence. `stop-guard` joins
`HOOK_CONTROLS` so the audit judges it.

The `intent` skill's step 5 gains one sentence.

Rejected: blocking on a red `stop` stage too. That is a different question with a human answer
("fix it" is not always right mid-refactor), and it is not what stalled the run.

Rejected: a state file for once-per-session. `stop_hook_active` is the CLI's own signal for the
same fact and needs no file to go stale.

## Files

- `.aidlc/lib/artifacts.mjs`
- `.aidlc/lib/ledger.mjs`
- `.aidlc/hooks/dispatch.mjs`
- `.aidlc/skills/intent/SKILL.md`
- `test/current-change.test.mjs`
- `test/stop-guard.test.mjs`
- `docs/OPERATING.md`
- `.aidlc/artifacts/an-unattended-turn-does-not-end-on-a-question/`

## Order

1. `test/current-change.test.mjs` — B1, B2: a written intent with a scaffold spec is listed with
   `reason: 'unwritten'`; a scaffold intent is not. Red, then `.aidlc/lib/artifacts.mjs` green.
2. `test/stop-guard.test.mjs` — B3, B4, B5 through `harness hook stop` on a staged fixture with a
   written intent: with `AIDLC_UNATTENDED=1` and no `stop_hook_active`, stdout is a block naming
   the change and the ledger has `stop-guard fail`; with `stop_hook_active: true`, no block and
   `stop-guard pass`; without the variable, no block and no row. Red, then
   `.aidlc/hooks/dispatch.mjs` and `.aidlc/lib/ledger.mjs` green.
3. `.aidlc/skills/intent/SKILL.md` — B6, one sentence; asserted by `test/stop-guard.test.mjs`
   reading the file.
4. `docs/OPERATING.md` — one sentence in the campaigns section.
5. `node evals/run.mjs --id campaign-ledger --require-auth` (B7); record as run 6 in
   `.aidlc/artifacts/one-integration-test/evidence.md`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/current-change.test.mjs` — a written intent with a scaffold spec is listed with `reason: 'unwritten'` and `governingPlans` is empty |
| B2 | `test/current-change.test.mjs` — a scaffold intent is not listed |
| B3 | `test/stop-guard.test.mjs` — unattended, first Stop: a block naming the change; `stop-guard fail` recorded |
| B4 | `test/stop-guard.test.mjs` — unattended, `stop_hook_active`: no block; `stop-guard pass` with `let-through` |
| B5 | `test/stop-guard.test.mjs` — attended: no block, no row |
| B6 | `test/stop-guard.test.mjs` — the skill's last step names the unattended case |
| B7 | the `campaign-ledger` run recorded in `.aidlc/artifacts/one-integration-test/evidence.md` run 6 |
