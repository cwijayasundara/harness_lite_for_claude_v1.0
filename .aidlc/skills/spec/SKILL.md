---
name: spec
description: Turns an accepted intent into numbered observable behaviours a human can approve, with explicit out-of-scope boundaries and safeguards. This skill should be used after an intent is written and before any plan or code, and whenever someone asks what a change should do rather than how it will be built.
---

# Write the spec

`spec.md` is the first human gate. It says what will be observably true, in the language of
whoever asked. It says nothing about files, modules, or order — that is the plan's job, and
mixing them is what makes a spec unreviewable by the person who wanted the change.

## Behaviours

One numbered heading each, `### B1`, `### B2`. Given / When / Then, in that shape, because it is
the shape a test takes:

```
### B3

Given an invoice 40 days overdue and a reminder sent yesterday,
When the reminder job runs,
Then no second reminder is sent, and the run records why it was skipped.
```

A behaviour a test cannot observe from outside is not a behaviour, it is a design note. Move it
or drop it. Number them permanently: the plan's proof table and every review finding cite these
ids, so renumbering breaks the chain.

## The rest

- **Out of scope.** What a reader would reasonably expect and will not get. This section prevents
  more rework than any other, because it is where the disagreement surfaces while it is cheap.
- **Safeguards.** Security, privacy, compatibility, performance and operational invariants the
  change must not break. Name the ones this change could plausibly break, not a checklist.
- **Entities.** Only if the domain has words the reader would otherwise guess at.

Structured prompt-driven development calls these Requirements, Entities, Approach, Structure,
Operations, Norms and Safeguards. Four of those live here; Approach, Structure and Operations are
the plan. Use them as a checklist for what to think about, never as required headings — required
sections are how one file grew to nine of them and 134 lines for a twenty-line change.

## Before you ask for approval

Read it as the person who wrote the intent. If a behaviour cannot be checked off by looking at
the running system, rewrite it. Then:

```
.aidlc/bin/harness approve <slug> spec --by <them>
```

That is theirs to run, not yours. Commit the spec first; an approval of an uncommitted file
approves something no reviewer can read.
