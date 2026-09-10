---
status: draft
source: docs/IMPROVEMENT-PLAN.md
source_revision: 737df627b99b87bf6dec0378a1a5ad05fd2f64a5
parent: lean-review-graph-retrieval
---
# Intent: a-pack-answers-the-question-asked

- **Date:** 2026-09-10
- **Author:** cwijayasundara
- **Source:** the "Code property graph" entry of `docs/IMPROVEMENT-PLAN.md`, which records the
  benchmark result this change explains and corrects.

## Problem

The 2026-09-10 record concludes that graph retrieval costs 2.01x bounded `rg` for identical
recall, and states plainly that this is "evidence for cutting, not against it". That conclusion
does not follow from the measurement, and the measurement is not comparing like with like.

`pack()` returns the definition, then every callee, then every caller. Bounded `rg` returns the
declaration line and sixteen lines around it. The benchmark scores both on one thing — did the
answer include the module that defines the term — and both score 100%. So `pack` is charged for
context the benchmark gives it no credit for.

Split by kind over the six repository terms, the cost is:

| | tokens | against bounded `rg` |
|---|---|---|
| bounded `rg` | 1,771 | 1.00x |
| `pack`, everything | 3,846 | 2.17x |
| `pack`, definition and skeleton only | 1,190 | **0.67x** |

Callers alone are 2,302 of `pack`'s 3,846 tokens — 60% of the cost. Asked the question the
benchmark actually scores, graph retrieval is a third cheaper than regex search, not twice the
price. The recorded 2.01x is a fact about breadth, not about graphs.

This matters beyond the number. The record as it stands is the only comparative evidence the
property-graph work produced, the graph-first versus Grep-first product comparison having been
skipped, and it argues for deleting a capability on a comparison it never made.

## Proposed outcome

The benchmark compares like with like, and the record says what was actually measured.

Observable from outside the system:

- A caller that wants only the definition can ask for only the definition and pay for only that.
- The benchmark reports bounded `rg`, narrow `pack` and full `pack` side by side, so a reader can
  see both what retrieval costs and what the extra context costs.
- The full-`pack` figure is still reported and still comparable to the 5,743 and 4,102 already on
  record, so nothing already measured becomes unreadable.
- The 2026-09-10 conclusion is corrected in place rather than quietly superseded.

## Affected users and systems

- `.aidlc/lib/pack.mjs` — gains a breadth option; its default is unchanged.
- `evals/bench/pack-bench.mjs` — gains a third arm.
- `docs/IMPROVEMENT-PLAN.md` — carries the correction.
- Readers of the record, who currently have a number pointing at a decision it does not support.

## Constraints

- **`pack`'s default does not change.** `.claude/CLAUDE.md` documents `harness pack <symbol>` as
  "budgeted definition, callees, callers", and `harness pack`, the map skill and
  `product-context.mjs` all rely on that. Narrow retrieval is a new option, not a new default.
- **This must not read as moving the goalposts after an unwelcome result, and must not be one.**
  The full-`pack` arm stays in the benchmark and stays in the record. The narrow arm is added
  beside it, not in place of it. `pack-bench.mjs`'s exit criterion is not touched, and a reader
  who trusts only the original arm can still read the original comparison.
- `.aidlc/baseline.json` records `pack_tokens_p50` from the default breadth. It must keep
  measuring the default, or the ratchet silently starts grading a different thing.
- Zero dependencies; `[limits]` unchanged; no new skill, hook, agent or control.

## Open questions

None blocking. One judgement recorded rather than asked: the narrow arm measures definition and
module skeleton, because that is what bounded `rg`'s declaration-plus-context actually returns.
Excluding the skeleton too would make the graph arm look better still and would no longer
correspond to anything a caller would ask for.
