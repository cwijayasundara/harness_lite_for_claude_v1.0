---
status: closed
---
# Intent: campaigns-run-unattended

- **Date:** 2026-09-04
- **Author:** cwijayasundara
- **Source:** `.aidlc/artifacts/evolving-scope/evidence.md` F1, campaign run 2026-09-04

## Problem

`campaign-ledger` halted 66 seconds into sprint 1 of 3, having written an intent and then asked:

> Does this intent capture what you need? Once approved, I'll move to the spec phase (Gate 1).

There is no human in an eval run. The agent did nothing wrong — `CLAUDE.md` says `approve` is the
human's to run and the gate is the point, and it obeyed. But the harness is a human-gated workflow
and a campaign is by construction unattended, and those two facts are incompatible as they stand.

This is not one failing behaviour among ten. It gates every other question `evolving-scope` set out
to ask. B4 (sprint 2 edits sprint 1's tests rather than replacing them), B5 (a contradiction is
surfaced rather than absorbed) and B6 (the artifacts still describe the code) have no campaign
evidence at all, because no campaign has ever reached sprint 2. B3 and B7 are unproved for the same
reason. The suite cannot ask its central question — does the harness hold on the fourth change to
the same code — until a campaign can get past the first one.

The cost of the blockage is that it is silent and cheap. A run that stops at gate 1 costs ten
cents and reports `fail` with two missing-file assertions, which looks like a weak model rather
than a structural incompatibility. It took reading the transcript to see that the agent stopped
because it was doing as it was told.

## Proposed outcome

A campaign runs to its last sprint without a human present, and nothing about the resulting
artifacts pretends a human was there.

Two halves, and the second matters as much as the first. `evidence.md` argues that "an eval-only
auto-approval would grade a workflow nobody runs" — so whatever makes a campaign proceed must
leave a mark. An approval granted because a run was unattended must be visibly distinct, in the
artifact, from one a person granted, so that no campaign result can ever be read as evidence that
someone looked.

## Affected users and systems

- The campaigns, and therefore every behaviour in `evolving-scope` that needs sprint 2 or later.
- The approval path in `.aidlc/lib/artifacts.mjs`, and whatever carries the eval signal into the
  staged copy. The agent under test runs as a separate `claude` process in a tmpdir, so the signal
  has to survive that boundary.
- Not the real workflow. A person's repository must be gated exactly as it is today, and the change
  is worth nothing if it makes that even slightly less true.

## Constraints

- The mechanism must be impossible to set by accident in a real repository, and hard to set on
  purpose without saying so. A flag that quietly disables gates is a worse defect than the one it
  fixes.
- Zero dependencies, as everywhere.
- The 22 existing golden tasks are single-prompt and never reach a gate. Their behaviour must not
  change at all.
- Law 11: this is a fix to harness machinery for a defect recorded while running it, not a new
  control. It should not add one.

## Open questions

- Does auto-approval cover the plan gate as well as the spec gate, or only spec? A campaign that
  auto-approves a plan is also auto-approving the `## Files` ownership that the write guard reads.
  Answered by: whoever writes the spec, before gate 1.
- Should a campaign still *exercise* the refusal before proceeding — that is, does B8's "refused,
  then shown a way forward that works" survive, with the auto-approval as the way forward? Or does
  auto-approving hide the very refusal B8 measures? Answered by: the spec.
- What happens at gate 3? Campaigns never merge, so the third gate may simply not arise. Confirm
  rather than assume.
