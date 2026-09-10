---
status: draft
---
# Plan: a-pack-answers-the-question-asked

## Approach

One option, one bench arm, one correction. The smallest change that makes the comparison honest.

`pack()` gains a `breadth` option defaulting to today's behaviour, so every existing caller is
untouched by construction rather than by inspection. The bench gains a third arm that differs from
the second only in the option it passes. The record gains a correction beside the figures it
corrects, not in place of them.

The discipline this change has to hold is that it is fixing a comparison after that comparison
produced an unwelcome result. That is legitimate only if nothing already measured becomes
unreadable and no threshold moves. So: the full arm keeps its name, its computation and its place
in the summary line; the exit gate is not touched; the default is not touched; and the correction
states plainly that the product comparison remains unrun and that this is not a vindication.

## Files

- `.aidlc/lib/pack.mjs`
- `evals/bench/pack-bench.mjs`
- `test/graph.test.mjs`
- `docs/IMPROVEMENT-PLAN.md`

## Order

1. Add the failing test first: `pack` asked for narrow breadth returns definition and skeleton
   pieces only, and asked for the default returns exactly the kinds it returns today, for the same
   term and budget. It must fail before step 2 exists. B1.
2. Add the `breadth` option to `.aidlc/lib/pack.mjs`, defaulting to today's behaviour and gating
   only which kinds are collected. B1.
3. Assert the default is untouched: the existing `pack:` tests in `test/graph.test.mjs` pass
   unedited, and a default pack for a repository term returns the same token count it did before
   this change.
4. Add the third arm to `evals/bench/pack-bench.mjs`, computed as the existing arm is but with
   narrow breadth. The full arm keeps its name, its computation, its column and its place in the
   summary line. B2.
5. Run the bench and record all three arms with their recall. B2.
6. Write the correction into the "Code property graph" entry of `docs/IMPROVEMENT-PLAN.md`,
   beside the original figures and without removing them, including the statement that no product
   comparison has been run and that this does not vindicate the graph overall. B3.
7. Confirm `.aidlc/baseline.json`'s `pack_tokens_p50` is unchanged, since the default breadth is
   unchanged — if it moved, the option leaked into the default and step 2 is wrong.
8. `harness check --stage commit`, and paste the output.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/graph.test.mjs` — narrow breadth returns only `definition` and `skeleton` kinds for a term that has callers and callees; default breadth returns the same kinds and the same token total as before the change. Written failing at step 1. |
| B2 | `node evals/bench/pack-bench.mjs` output at step 5, recorded in `docs/IMPROVEMENT-PLAN.md`: three arms, recall per arm, the full arm still summarised as it was. Plus a `test/graph.test.mjs` assertion that the bench's full-arm figure is computed from the default breadth, so the recorded history stays comparable. |
| B3 | The correction added to `docs/IMPROVEMENT-PLAN.md` at step 6, with the original 5,743, 4,102 and 2.01x still present on the page. Prose evidence a reviewer reads, not an executed test. |

`test/graph.test.mjs` is `node:test`, so these are file-and-test-name rows rather than pytest node
ids. B3 is a document; no test can grade whether a correction is honest, which is why the spec
states what it may not claim.

## Coordination

This change has no `depends_on` and declares no `## Dependencies` table. It `extends:`
`code-property-graph`, whose recorded benchmark it explains and corrects; that change is delivered
and nothing here waits on it.

`.aidlc/lib/pack.mjs`, `test/graph.test.mjs` and `docs/IMPROVEMENT-PLAN.md` are named in
`code-property-graph`'s `## Files`, and `evals/bench/pack-bench.mjs` too. Those overlaps are with a
delivered change rather than an in-flight one, so serialization is already satisfied.
