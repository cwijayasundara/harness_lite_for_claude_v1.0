---
name: intent
description: Turns a conversation, a PRD, or a vague request into a version-controlled intent.md — the problem, the outcome, the constraints, and the questions that block progress. This skill should be used whenever someone describes something they want built or changed and no intent file exists yet, including when they paste a PRD or a ticket. Start here rather than jumping to a plan.
---

# Write the intent

The intent captures **what is wrong and what should become true**. It contains no solution.
Its whole job is to be small enough that a human will actually read and approve it.

## Do this

1. `bash .aidlc/bin/harness new intent <slug>` — creates the file from the template.
2. Interview the person. **One question at a time.** Wait for the answer before the next one.
3. If a question can be answered by reading the codebase, read the codebase instead of asking.
4. Fill the file. Leave `Open questions` populated — an intent with no open questions on the
   first pass usually means you did not push hard enough.
5. Stop. Ask the person to accept it. After acceptance, create one delivery contract with
   `harness contract new <slug>`; do not create separate spec or plan files.

## When the source is a PRD

Read it, then still interview. A PRD tells you what someone wants; it rarely tells you what is
wrong today, and the problem statement is checked against the delivery contract later.
Quote the PRD for the outcome, write the problem in your own words, and list every place the
PRD is ambiguous under `Open questions`.

## Anti-patterns

- **Solutioning.** "Add a Redis cache" is not a problem. "Search takes 4s at p95 and support
  gets ~10 complaints a week" is.
- **Merging several changes into one intent.** One intent, one outcome. If the outcome needs
  the word "and", write two files.
- **Inventing constraints.** Only write what the person or the codebase told you.
