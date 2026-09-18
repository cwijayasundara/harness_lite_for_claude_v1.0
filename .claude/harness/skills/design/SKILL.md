---
name: design
description: Resolves the design of a change before any of it is written — brainstorms the outcome in short questions, settles the branches a reader would otherwise argue about, and produces the spec's Entities, Approach, Structure and Safeguards sections. This skill should be used after an intent is accepted and before or alongside the spec's behaviours, and whenever someone asks how a change should be shaped rather than what it should do.
model: claude-opus-5
effort: high
---

# Resolve the design before writing it

A design written as prose after the fact is a rationalisation. This runs before: the branches get
named, one gets chosen, and the reasons go in the spec where a reviewer can disagree with them.

Read `intent.md` first, then the code the change lands in. Locate it with the graph rather than by
opening files — see "Finding your way around" in `.claude/harness/instructions.md`.

## Brainstorm in short questions

Ask the human, one question at a time, and stop as soon as the answer stops changing the design.
Three or four is usually enough; more than six means the intent is not settled and belongs back
there.

Ask about the things that are expensive to change later:

- **The outcome, in the affected user's words.** What is true after this that is not true now?
- **The entities.** What are the nouns, what does each one own, and which one owns the decision
  this change is about? A design that splits one noun across two owners is the defect being
  designed in.
- **The branch.** Where could this reasonably go two ways? Name both, and say which is chosen and
  what it costs. An unnamed branch is one a reviewer will re-litigate at the gate.
- **The safeguard.** What must stay true that this could break — compatibility, a privacy
  boundary, an operational invariant, an ordering guarantee?

Under `AIDLC_UNATTENDED`, do not ask: make the routine choices the intent already implies, and
record the ones you could not decide in the spec's Design section as open questions.

## Write four sections, in the REASONS shape

Fill these into `spec.md`. Each says what was decided and why, in the fewest words that survive a
reviewer asking "why this and not the other thing":

| Section | What it settles |
|---|---|
| **Entities** | The nouns, what each owns, and where the decision this change is about lives |
| **Approach** | The path chosen, the path rejected, and what the choice costs |
| **Structure** | Where the code goes and which existing seam it uses |
| **Safeguards** | What must not break, stated so a check or a test could observe it |

Every claim names its evidence: a file, a symbol, a measurement, or a person's answer. "It is
cleaner" is not a reason; "`artifacts.mjs` already owns approval state, so a second owner would be
two sources for one question" is.

## Stop at the design

This skill does not write behaviours, does not write a plan, and does not touch code. The spec's
`### B<n>` behaviours are the `spec` skill's; the files and the proof are the `plan` skill's. A
design that has already chosen the implementation has skipped the gate it exists to inform.

Say what you could not resolve. An open question written down is a gate the human can answer; one
left out is a decision you made without telling anyone.
