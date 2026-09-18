---
status: approved
by: cwijayasundara
at: 2026-09-06T07:24:15.478Z
digest: sha256:bd802ceb5e4b9e2de628b63990a633369042e28fdc15501073ec9f04bac0c942
---
# Plan: an-edited-approval-awaits-its-gate

## Approach

`draftsAwaitingGate(cfg)` returns `{ slug, kind, reason }` entries instead of bare slugs: a
filled-in draft spec (`reason: 'draft'`, gate 1), a spec in `stale-approval` (`reason: 'stale'`,
gate 1), a plan in `stale-approval` on an open change (`reason: 'stale'`, gate 2). The three
consumers — the guard's `contractRefusal`, `scope-drift`'s `draft-awaits-gate` branch and
`currentLine` — read the entry and word the message from it. `governingPlans` is unchanged: it
already returns nothing while the list is non-empty.

Rejected: refusing the edit of an approved artifact at the write guard. Amend-then-re-approve is
the ordinary way a plan grows a file, and this session did it three times.

Rejected: a separate function for stale approvals. One list, one wording, one place to read.

## Files

- `.aidlc/lib/artifacts.mjs`
- `.aidlc/lib/guard.mjs`
- `.aidlc/checks/scope-drift.mjs`
- `test/current-change.test.mjs`
- `test/guard.test.mjs`
- `test/scope-drift.test.mjs`
- `test/gate-content.test.mjs`
- `docs/OPERATING.md`
- `.aidlc/artifacts/an-edited-approval-awaits-its-gate/`

## Order

1. `test/current-change.test.mjs` — B2, B3, B5: an edited approved spec on an open change is in
   `draftsAwaitingGate` with `reason: 'stale'` and `governingPlans` is empty though an older
   approved plan exists; an edited approved plan likewise with `kind: 'plan'`; a closed change's
   edited spec is not listed; `status` and `session-start` print `awaiting gate 1: <slug> (spec
   edited after approval)`. Red.
2. `.aidlc/lib/artifacts.mjs` — the entries and the wording. Green.
3. `test/guard.test.mjs` — B1: the refusal names the change, the artifact, both remedies and
   `supersedes:`, never `require_contract`. Red, then `.aidlc/lib/guard.mjs` green.
4. `test/scope-drift.test.mjs` — B4: rule `draft-awaits-gate` naming the change and artifact.
   Red, then `.aidlc/checks/scope-drift.mjs` green.
5. `docs/OPERATING.md` — one sentence after the declaration sentence.
0. Before all of the above, B7: `test/gate-content.test.mjs` — a spec body mentioning `<slug>`
   has no template markers; red, then `templateMarkers` in `.aidlc/lib/artifacts.mjs` reads
   `parse(templateText).body` instead of the whole template file. Green. This unblocks approving
   this very spec.
6. `node evals/run.mjs --id campaign-ledger --require-auth` (B6); record as run 4 in
   `.aidlc/artifacts/one-integration-test/evidence.md`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/guard.test.mjs` — a product write under an open change with an edited approved spec is refused naming it, both remedies and `supersedes:` |
| B2 | `test/current-change.test.mjs` — `governingPlans` is empty while the stale approval stands, with an older approved plan present |
| B3 | `test/current-change.test.mjs` — a closed change's edited spec is not listed |
| B4 | `test/scope-drift.test.mjs` — rule `draft-awaits-gate` names the change and the artifact |
| B5 | `test/current-change.test.mjs` — `harness status` and the `session-start` action print the `awaiting gate` line with the artifact |
| B6 | the `campaign-ledger` run recorded in `.aidlc/artifacts/one-integration-test/evidence.md` run 4 |
| B7 | `test/gate-content.test.mjs` — a spec body mentioning `<slug>` carries no template marker |
