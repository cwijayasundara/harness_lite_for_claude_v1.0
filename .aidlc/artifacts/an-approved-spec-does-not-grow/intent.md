---
status: draft
---
# Intent: an-approved-spec-does-not-grow

- **Date:** 2026-09-06
- **Author:** cwijayasundara
- **Source:** `.aidlc/artifacts/one-integration-test/evidence.md` F35 — the fifth instance of
  F9, on run 6 of the five-sprint integration test. Intent only, by the owner's instruction
  that the fix-and-run loop stops; the spec waits for a decision to run again.

## Problem

Five gates now stand between a sprint and an unrecorded reversal: a closed change governs
nothing, a written draft waits at gate 1, a named id must be linked, an edited approval waits at
its gate, and a spec approved beside others declares its relation to each. Run 6 went around all
five by amending: it added a behaviour to the previous sprint's approved spec, was refused its
write, re-approved the spec, and the relation gate was satisfied by the `extends:` line that
spec had truthfully declared before the amendment made it false.

An approved spec's behaviours are the record of what was promised. `a-spec-can-be-superseded`
built supersession so that record would never be edited; the amendment route edits it, and the
gate re-approves the edit because nothing compares the new behaviour set with the old.

## Proposed outcome

Re-approving an edited approved spec is refused when it has more `### B<n>` headings than the
committed approved text had. The refusal says new behaviours belong in a new change, which must
declare its relation and, if it reverses one, link it. Prose edits, and removals, stay allowed.

## Affected users and systems

- `contentIssues()` in `.aidlc/lib/artifacts.mjs`, which can read the committed text with the
  `git show HEAD:<path>` the `isCommitted` check already depends on.
- Every re-approval in this repository, including the three plan amendments this session made —
  none of which added a behaviour to a spec.

## Constraints

- Mechanical: a count of headings against the committed approved text. No judgment about what
  the new behaviour means.
- A spec approved for the first time is unaffected; only re-approval compares.
- No new skill, hook binding or verb. Law 11: fifth instance of one defect on the campaign.

## Open questions

- **Removing a behaviour from an approved spec.** Allowed by this intent, because retiring is a
  different act from reversing; whether it should also be refused is the next finding's call.
