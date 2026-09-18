---
status: draft
# supersedes: <slug>#B<n> — add this line when a behaviour here reverses one an earlier approved spec claims; the named spec is never edited
# extends: <slug> — optional continuity claim for related work whose promises still hold; unrelated changes need no link
---
# Spec: {{slug}}

## Outcome

<The observable result, in the language of the affected user.>

## Observable behaviours

Before approval add a ## Requirements table: Source criterion | Behaviour IDs.
Use comma-separated B IDs; cover every behaviour. Prefix locally assigned criteria with
local: when the source has no published IDs. New approvals bind committed intent/source
inputs and semantic metadata. Corrections require impact review and reapproval.

### B1

Given ...
When ...
Then ...

## Design

Written by the `design` skill before the behaviours above, not rationalised after them. Every
claim names its evidence — a file, a symbol, a measurement, or a person's answer.

### Entities

<The nouns, what each one owns, and which one owns the decision this change is about. A design
that splits one noun across two owners is the defect being designed in.>

### Approach

<The path chosen, the path rejected, and what the choice costs. An unnamed branch is one a
reviewer will re-litigate at the gate.>

### Structure

<Where the code goes and which existing seam it uses.>

### Safeguards

<What must not break, stated so a check or a test could observe it.>

## Out of scope

<Explicit boundaries. What a reader might reasonably expect and will not get.>

<Security, privacy, compatibility, performance and operational invariants live in the Safeguards
section of ## Design above.>
