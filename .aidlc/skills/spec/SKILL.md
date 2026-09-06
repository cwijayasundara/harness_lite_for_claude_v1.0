---
name: spec
description: Turns an accepted intent into numbered observable behaviours a human can approve, with explicit out-of-scope boundaries and safeguards. This skill should be used after an intent is written and before any plan or code, and whenever someone asks what a change should do rather than how it will be built.
---

# Write the spec

`spec.md` is the first human gate. It says what will be observably true, in the language of
whoever asked. Include consequential design decisions, system boundaries and safeguards so
the human can approve their implications. The plan owns exact files, work order and proof.

## Behaviours

One numbered heading each, `### B1`, `### B2`. Given / When / Then, in that shape, because it is
the shape a test takes:

```
### B3

Given an invoice 40 days overdue and a reminder sent yesterday,
When the reminder job runs,
Then no second reminder is sent, and the run records why it was skipped.
```

Keep observable behaviours separate from design notes; put consequential design in a concise
Design section. Number them permanently: the plan's proof table and every review finding cite these
ids, so renumbering breaks the chain.

## The rest

- **Out of scope.** What a reader would reasonably expect and will not get. This section prevents
  more rework than any other, because it is where the disagreement surfaces while it is cheap.
- **Safeguards.** Security, privacy, compatibility, performance and operational invariants the
  change must not break. Name the ones this change could plausibly break, not a checklist.
- **Design.** Relevant architecture, interfaces, state and failure paths; follow existing patterns
  and explain meaningful departures. Include only decisions that matter to this change.
- **Entities.** Only if the domain has words the reader would otherwise guess at.
- **Supersedes.** If a behaviour here reverses one an earlier approved spec claims, say so instead
  of writing around it: `supersedes: <slug>#<behaviour-id>` in this file's frontmatter,
  comma-separated for more than one. The named spec is never edited — its approval, its digest,
  its file all stand — and the link only takes effect once this spec is itself approved.
  `harness status` and `SessionStart` name it from there. Naming an approved behaviour's id in
  the prose without the link is refused at approval: the field is the record, the prose is not.
  And for every other open change whose spec is approved, say which it is — `supersedes:` a
  behaviour of it, or `extends: <slug>` when all its promises still hold. Approval refuses a
  spec that says neither.

Scale detail to risk. Use only sections that help the reader decide; do not invent content to
fill a checklist. Routine implementation choices belong inside the approved design boundary.

## Before you ask for approval

Read it as the person who wrote the intent. If a behaviour cannot be checked off by looking at
the running system, rewrite it. Then:

```
.aidlc/bin/harness approve <slug> spec --by <them>
```

That is theirs to run, not yours. Commit the spec first; an approval of an uncommitted file
approves something no reviewer can read.
