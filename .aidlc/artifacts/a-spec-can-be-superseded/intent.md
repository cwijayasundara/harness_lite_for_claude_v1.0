---
status: closed
---
# Intent: a-spec-can-be-superseded

- **Date:** 2026-09-04
- **Author:** cwijayasundara
- **Source:** `.aidlc/artifacts/evolving-scope/evidence.md` F9 and F10, campaign run 2026-09-04

## Problem

Sprint 3 of `campaign-ledger` asked that a paid invoice never read as overdue. That reverses a
behaviour approved in sprint 1. The agent found the conflict and named the behaviour:

> **Sprint 1 (ledger) Spec Behaviors Affected:** **B2** — This behavior now needs to be understood
> with the clarification that recording a due date doesn't automatically create an "overdue" status.

Then it called the reversal a clarification — "the implicit understanding of due date *evolves*" —
and wrote its analysis into a closing message that was deleted with the temporary directory.
Sprint 1's `spec.md` still says `status: approved` and still describes behaviour the code no longer
has.

The agent had nowhere to put it. There is no `supersedes:` link, no verb that amends an approved
spec, no accumulated product spec, and no field anywhere that says "this behaviour was true and is
not any more". `stale-approval` catches an artifact edited *after* its own approval; it is silent
about an artifact made false by a *different* change. So the only available moves were to rewrite
history, or to narrate the conflict somewhere nobody will read. It chose the second, which is the
better of two bad options.

The same run produced the other half. Sprint 3 created no change of its own: `isOverdue` was added
to `src/ledger.mjs` under sprint 2's approved plan, which already owned that path. The write guard
was correct — an approved committed plan owned the file — and a product behaviour still changed
with no intent, no spec and no plan describing it. Owning a path is not authority to do anything to
it, and the harness cannot presently tell those two apart.

These are one problem seen from two sides. The artifact model can express what a change promises
and cannot express what a change *un*-promises. Every project longer than one sprint eventually
needs the second, and this one needed it by sprint 3.

## Proposed outcome

Someone reading an approved `spec.md` can tell whether it is still true, without reading every
change that came after it.

That is the whole of it. Whatever mechanism delivers it must also mean the campaign's sprint 3 has
somewhere honest to record what it did, so the next run of `campaign-ledger` fails if the
supersession goes unrecorded — which is `evolving-scope` B5, currently failing for exactly this
reason.

## Affected users and systems

- Any project past its first change, which is every project. The harness's own repository has
  twenty-four closed changes and no way to know which of their behaviours still hold.
- `.aidlc/lib/artifacts.mjs`, which owns approval state and the `stale-approval` computation.
- `.aidlc/skills/spec` and `.aidlc/skills/plan`, if the agent needs telling that the move exists.
  Nothing will use a mechanism nobody mentions — `evidence.md` F6 is that lesson already paid for.
- `evolving-scope` B5's assertion, which currently grades vocabulary and should grade a recorded
  fact instead.

## Constraints

- **Law 11 is satisfied and should not be exceeded.** This has a failing eval (`evolving-scope` B5)
  and a defect recorded from a real run. That earns *this* change. It does not earn a general
  product-specification layer, and the temptation to build one should be resisted until something
  fails for want of it.
- The budget is full. `[limits]` sits at its ceilings; a new skill means deleting one.
- Zero dependencies.
- Whatever is added has to survive the thing that killed the last mechanism: it must reach an agent
  that is not looking for it.

## Open questions

- **Which shape?** A `supersedes:` field in the superseding spec's frontmatter; an amendment verb
  that edits the superseded spec in place and re-digests it; or a derived view that reads all
  approved specs and reports which behaviours later changes contradict. The campaigns were run to
  answer this and the evidence now exists, but the choice belongs in the spec, argued from F9
  rather than from taste. Answered by: whoever writes the spec, before gate 1.
- **Does a sprint that changes product behaviour always need its own change (F10), or is that a
  separate concern?** It may be that ownership needs a second dimension — this plan owns this path
  *for this purpose* — or it may be that the answer is simply "yes, always", enforced somewhere.
  Deciding now would be guessing at a fix for a symptom observed once.
- **Should `harness status` report behaviours whose specs later changes contradict?** It is the
  natural place and it is also the channel F6 proved nobody reads unprompted.
