---
status: approved
by: cwijayasundara
at: 2026-09-06T06:32:07.974Z
digest: sha256:27f31836b154babcb40486fc296a5e86fe4c65053e9572716d481e02f729822f
---
# Plan: a-draft-is-a-declaration

## Approach

One new function beside `currentChange()`: `draftsAwaitingGate(cfg)` returns the open changes
whose spec is `draft` and whose body has no `templateMarkers('spec', body)`. Everything else is a
consumer of that list.

The guard's `contractRefusal()` gains a first branch: if any draft is waiting, refuse naming it,
before the current-change branches. `governingPlans()` is unchanged in signature and returns
`[]` while a draft waits, so `scope-drift` and the guard agree without a second reader; the check
then asks `draftsAwaitingGate()` to choose the rule id `draft-awaits-gate` over the current-change
findings it already distinguishes. `currentLine()` gains the `awaiting gate 1:` lines, and both
`status` and `session-start` already print it.

The campaign assertion is the existing `file_matches` on `supersedes:` plus
`diff_owned_by_current_change`; with the guard refusing the write, sprint 3 can only pass by
approving its spec, which makes it current, and the run asserts what it recorded.

Rejected: a separate `harness declare` step. It is a verb, it is one more thing to forget, and
the spec is already the declaration.

Rejected: treating a draft *plan* as the declaration. The spec is the earlier gate.

## Files

- `.aidlc/lib/artifacts.mjs`
- `.aidlc/lib/guard.mjs`
- `.aidlc/checks/scope-drift.mjs`
- `test/current-change.test.mjs`
- `test/guard.test.mjs`
- `test/scope-drift.test.mjs`
- `docs/OPERATING.md`
- `.aidlc/artifacts/a-draft-is-a-declaration/`

## Order

1. `test/current-change.test.mjs` — B1's data and B2: a filled-in draft spec beside an approved
   change is returned by `draftsAwaitingGate`; a scaffold spec is not; `governingPlans` is empty
   while a draft waits; `harness status` and `session-start` print `awaiting gate 1: <slug>` (B4).
   Red.
2. `.aidlc/lib/artifacts.mjs` — `draftsAwaitingGate(cfg)`, `governingPlans` empty while one
   waits, `currentLine` lines. Green.
3. `test/guard.test.mjs` — B1 and B5: a product write under a filled-in draft is refused naming
   the draft and `harness approve <slug> spec`, without `require_contract`; closing the draft's
   intent lifts it; approving it makes it current. Red, then `.aidlc/lib/guard.mjs` green.
4. `test/scope-drift.test.mjs` — B3: rule `draft-awaits-gate` naming the change. Red, then
   `.aidlc/checks/scope-drift.mjs` green.
5. `docs/OPERATING.md` — two sentences after the current-change paragraph.
6. `node evals/run.mjs --id campaign-ledger --require-auth` (B6); record in
   `.aidlc/artifacts/one-integration-test/evidence.md` as run 2 and here as evidence.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/guard.test.mjs` — a product write is refused naming the drafted change and the approve command, never `require_contract` |
| B2 | `test/current-change.test.mjs` — a scaffold spec is not returned by `draftsAwaitingGate` and the current plan still permits the write |
| B3 | `test/scope-drift.test.mjs` — rule `draft-awaits-gate` names the change |
| B4 | `test/current-change.test.mjs` — `harness status` and the `session-start` action print `awaiting gate 1: <slug>` |
| B5 | `test/guard.test.mjs` — closing the draft's intent, or approving its spec, lifts the refusal |
| B6 | the `campaign-ledger` run recorded in `.aidlc/artifacts/one-integration-test/evidence.md` run 2: sprint 3 records `supersedes:` and every product write belongs to its own plan |
