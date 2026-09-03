# Intent: first-pass-review-can-be-true

- **Status:** approved
- **Author:** cwijayasundara

## Problem

The first review in this repository's history was signed `approved` today. The indicator read:

```
first-pass review           0/1 (0)
```

`ever_requested_changes` is `git log -S 'changes-requested' -- <review file>`. `-S` matches any
commit that changes the number of occurrences of that string anywhere in the file — additions and
deletions alike. `.aidlc/templates/review.md:5` ships the word inside the Status line's own
comment, listing the allowed values:

```
- **Status:** draft <!-- draft | approved | changes-requested  (HUMAN GATE 3) -->
```

So creating a review from the template counts as one match, and replacing that line when signing
counts as another. Every review written the intended way is judged to have previously requested
changes, and the indicator cannot report a first-pass approval at all. It could only ever return
the negative.

The existing test does not catch this. `test/indicators.test.mjs` writes `changes-requested` as
the literal Status *value*, so it passes under both the broken implementation and a correct one.
It was not wrong, only insufficient: it never exercised a review carrying the template's comment,
which is every real review.

This is the fourth measurement in this repository found reporting a number it was incapable of
varying — after the ledger's single run, the eval score that survived five task renames, and
intent survival that could not fall below 1.0.

## Outcome

A review that was approved without ever having been sent back counts as a first-pass approval,
and one that was genuinely sent back does not.

## Affected systems

`.aidlc/lib/contract-chain.mjs`, and the first-pass coverage in `test/indicators.test.mjs`.

## Constraints

The rule itself is right and does not change: a review that ever said `changes-requested` is not a
first-pass approval, however it reads now. What changes is how that is detected — the Status field
across the file's history, rather than a substring anywhere in it.

The template keeps its comment. Naming the allowed values where a person edits them is worth more
than working around a measurement bug by deleting the documentation.

## Open questions

Whether other indicators lean on `git log -S` in the same way. `intent_rework_after_spec` counts
commits rather than matching strings, so it is not affected, but the pattern is worth a look if a
fifth indicator turns out to be unable to move.
