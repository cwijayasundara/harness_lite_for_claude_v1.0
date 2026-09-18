---
status: draft
migrated_from: sha256:8a04d86ab7a2030e9b6ed98fccc039dbba24b5823a14158e0851a09dfff70459
---
# Spec: first-pass-review-can-be-true

## Outcome

The first-pass review rate can report a first pass.

## Observable behaviours

### B1

Given a review created from the template — whose Status line carries the comment
`<!-- draft | approved | changes-requested (HUMAN GATE 3) -->` — and later signed `approved`
without ever being sent back,
When the indicator is computed,
Then it counts as a first-pass approval.

### B2

Given a review whose Status field was `changes-requested` in some commit and reads `approved`
now,
When the indicator is computed,
Then it does not count as a first-pass approval. The rule is unchanged; only its detection is.

### B3

Given this repository after `p0-unblock-the-loop` was signed,
When `harness status` runs,
Then `first-pass review` reads `1/1 (1)`.

### B4

Given a review still in `draft`,
When the indicator is computed,
Then it is in neither the numerator nor the denominator — an unsigned review is not a failed one.

## Out of scope

The template's comment, which stays: naming the allowed values where a person edits them is worth
more than working around a measurement bug by deleting the documentation. Any change to what
counts as a first pass. Auditing the other indicators for the same pattern — recorded as the
intent's open question.

## Safeguards

- B2 keeps the rule: a review genuinely sent back is still not a first pass, so this narrows the
  detection and never the standard.
- B1 uses a fixture carrying the template's comment, which is what the existing test lacked — the
  gap that let the defect through is the thing now covered.
- B4 keeps an unsigned review out of the denominator, so the rate cannot be moved by leaving
  reviews unwritten.
- The template is untouched, so the fixture and the real artifacts stay the same shape.

## Entities and existing context

- `ever_requested_changes` (`.aidlc/lib/contract-chain.mjs`) — today
  `Boolean(git log -S 'changes-requested' -- <file>)`. `-S` matches a change in occurrence count
  anywhere in the file, in either direction, so both writing the template and replacing its
  comment on signing count as matches.
- `.aidlc/templates/review.md:5` — ships `changes-requested` inside the Status line's comment.
- `history` / `at` / `field` (`.aidlc/lib/contract-chain.mjs`) — already walk a file's commits and
  parse a named field out of each version. `committedWhen` is built from them; this needs the same
  walk asking a different question.
- `test/indicators.test.mjs :: a review that ever requested changes is not a first-pass approval`
  — passes under both implementations, because its fixture writes `changes-requested` as the
  Status value and never carries the template comment.
