---
status: approved
by: cwijayasundara
at: 2026-09-06T06:32:07.920Z
digest: sha256:f63f7dd7f4f6ab40cb08b1c50d712e424582db28ec4c7becc912eb84cd3c790d
---
# Spec: a-draft-is-a-declaration

## Outcome

A product file cannot change while a change with a written, unapproved spec is open. The agent
that wrote the spec is sent to gate 1, and a reader of `harness status` can see which draft is
waiting.

## The shape, argued from F30

Sprint 3 wrote a spec and did not approve it. Three things could make that impossible to route
around.

**Closing the previous change automatically** — at plan approval, at review, at a Stop — would
have left sprint 2 closed and sprint 3 without a plan, which is F26's shape and is already
refused. But every trigger is wrong for a human: a change is not delivered because a session
ended, and the intent said closing stays a hand edit. Rejected.

**Making the newest drafted change current** was the first candidate in
`a-diff-belongs-to-one-change` and was rejected there because a backlog of drafts would each take
a turn being current and governing nothing. That objection stands.

**Treating a written spec as a declaration** is what remains, and it is what gate 1 already
means: a spec with behaviours in it is a claim about what will be built, and the chain says a
claim is approved before code follows. So the current change stays the most recently approved
spec, and a further rule sits in front of it: while any open change has a spec that is filled in
and not approved, no product write is permitted, and the refusal names that change. The
scaffold `harness new` leaves — placeholders and the bare `### B1` — is not filled in, so a
backlog blocks nothing. `templateMarkers()` already draws exactly that line for the approval
gate, and this rule reads the same function so the two cannot disagree.

## Observable behaviours

### B1 — a written draft blocks product writes

Given an open change whose `spec.md` is `draft` and carries no template markers,
When a product file is written,
Then the write is refused. The refusal names the change and says: approve its spec (`harness
approve <slug> spec`), or close the change. It does not name `require_contract`.

### B2 — a scaffold declares nothing

Given an open change whose `spec.md` still carries a template marker (a `<placeholder>` or the
bare `### B1`),
When a product file is written,
Then that change is ignored and the current change's plan decides, exactly as today.

### B3 — scope-drift asks the same question

Given a working diff touching product files and an open change with a written, unapproved spec,
When `scope-drift` runs,
Then every product file is a finding with rule `draft-awaits-gate`, naming the change.

### B4 — the draft is visible

Given an open change with a written, unapproved spec,
When `harness status` runs and when a session starts,
Then the `current:` line is followed by `awaiting gate 1: <slug>` for each such change.

### B5 — approving or closing lifts it

Given the refusal in B1,
When the spec is approved, or the change's `intent.md` is set to `status: closed`,
Then the next product write is judged by the current change's plan and nothing else.

### B6 — the campaign proves it

Given `campaign-ledger` sprint 3 under the unattended runner,
When the agent writes a spec for the contradiction and does not approve it,
Then its first product write is refused naming that spec, and the sprint cannot end green
without approving it — at which point `supersedes:` is the recorded link the run asserts.

## Out of scope

- A stale-approval spec. It is already not approved, but it was once, and the existing
  `stale-approval` reporting covers it; this rule reads `state === 'draft'` only.
- Draft plans. A plan cannot be approved before its spec, so the spec is the earlier gate and
  the one that carries the declaration.
- Closing anything automatically.

## Safeguards

- No new skill, hook binding or verb.
- Every existing guard and scope-drift test passes unchanged: none of them creates a filled-in
  draft spec beside an approved one.
- `templateMarkers()` is the one definition of "filled in", shared with the approval gate.
- The refusal names a next step and not the switch, as `a-diff-belongs-to-one-change` requires.
