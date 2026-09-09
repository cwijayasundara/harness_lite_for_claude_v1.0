---
status: draft
source: docs/IMPROVEMENT-PLAN.md
source_revision: 29672945f7595d50b00bfc464e957a377a2fe553
parent: lean-review-graph-retrieval
---
# Intent: graph-first-versus-grep-first

- **Date:** 2026-09-09
- **Author:** Claude, recording the user's decision to settle the graph row's
  outstanding condition rather than leave it deferred
- **Source:** the lean-review graph row and the closing paragraphs of the
  8 September 2026 review in `docs/IMPROVEMENT-PLAN.md` at `2967294`; the user's
  decisions of 2026-09-09 authorising a paid run at USD 10 / 40 minutes and
  choosing to build a discriminating task first.

## Problem

The graph row says removal may be considered "only after a graph-first versus
Grep-first product comparison," and that "advisory packing alone is not that
comparison." That comparison has never been run, and the harness cannot
currently run it.

The existing `graph` pair does not measure retrieval. `campaign.mjs` builds a
pack for the step's files and pastes it into the prompt, so `with-graph` is the
same agent as `without-graph` with extra context prepended — advisory packing,
which the row names and rejects. Worse, the base instruction every arm receives
already says "Use rg and bounded reads as needed," so `without-graph` is
already a Grep-first arm and no arm has ever been told to query the index
first. The pair that looks like the comparison is the one the row excludes.

The evidence is also incapable of discriminating. Native, harness, graph-off and
graph-on all accepted 33 of 33 changes. Four arms at ceiling means the products
do not make locating code the hard part: they are small enough that any
retrieval strategy finds the right file, so the measurement cannot separate the
strategies whatever it costs to run.

The same gap keeps the review's last paragraph honest but unresolved: "Runtime
removal experiments remain recommendations, not completed validation." One
pruning experiment is complete — the session-inventory banner, baseline against
lean, 11 of 11 both arms — but the mechanism the review most wants a verdict on
is the graph, and no experiment has been able to give one.

Separately, and much smaller: the review section states two different sizes for
the same ledger. The disposition row records 8,075 rows over 630 runs from a
2026-09-09 snapshot; a later paragraph still says 7,493 rows over 593 runs with
no date attached. One of them is stale and a reader cannot tell which.

## Proposed outcome

The comparison the row asks for can be run, and is run.

A retrieval pair exists whose arms differ in how the agent is told to find code
and in whether an index is there to query — not in what is pasted into its
prompt. A product exists where finding the right code is the hard part, so a
difference between the arms has somewhere to show up. The paired run happens
inside the ceiling the user authorised, and its outcome is recorded as what it
is: a difference, a tie, or an incomplete run, with the limits of the sample
stated.

The graph row then records a result instead of a condition, and the review's
closing paragraph records which removal experiments are validated and which are
not. The ledger figures in that section agree with each other or say when each
was taken.

The result does not itself remove anything. If Grep-first wins, removal becomes
a decision the user can make on evidence; if the arms tie, that is recorded as
a tie on tasks that were built to discriminate, which is a stronger statement
than the ties recorded so far.

## Affected users and systems

`evals/lib/comparison.mjs` and `evals/lib/campaign.mjs`, which gain one pair and
one arm behaviour; `evals/products.json` and `evals/fixtures/`, which gain a
product; `evals/evidence/`, which gains the run's portable outcomes; readers of
the lean review, whose graph row and closing paragraphs change.

## Constraints

- Spend stops at USD 10 and 40 minutes. The runner already enforces both; an
  overrun is recorded as incomplete and never retried past the ceiling.
- Neither arm may receive an injected pack. The difference between them is the
  instruction and the availability of an index to query, or the experiment
  repeats the one the row rejects.
- Do not change what the harness does in production: no control, hook binding,
  skill, agent, CLI verb or `[limits]` change, and no change to `.aidlc/lib/`
  beyond nothing.
- Do not edit `evals/fixtures/` fixtures that already exist; they are
  write-protected because a fixture edited to make a test pass no longer tests.
  The discriminating product is a new one.
- Record failed, interrupted and over-ceiling attempts rather than deleting
  them, as the earlier comparisons did.
- Do not claim a removal decision from this run. The row asks for a comparison,
  and a comparison is what it gets.
- Approvals inside the campaign remain driver-owned and simulated, as in every
  previous comparison; that limit is restated wherever the result is.

## Open questions

None
