---
status: draft
extends: code-property-graph
---
# Spec: a-pack-answers-the-question-asked

## Outcome

The benchmark compares like with like, a caller can ask for only the definition, and the record
says what was measured rather than what was inferred from an uneven comparison.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| local:ask-for-only-what-you-need | B1 |
| local:compare-like-with-like | B2 |
| local:the-record-says-what-was-measured | B3 |

## Observable behaviours

### B1

Given a caller that needs the definition of a symbol and not its neighbourhood,
When it asks `pack` for narrow breadth,
Then the result carries the definition and, where the term names a module, its skeleton — and no
callee or caller slices. Asked for the default breadth, or asked for nothing, `pack` returns
exactly what it returns today: definition, callees, callers, inside the same budget, in the same
order, rendered the same way. `harness pack`, the map skill, `product-context.mjs` and
`baseline.mjs`'s `pack_tokens_p50` are unaffected, because the default is what they use and the
default has not moved.

### B2

Given `evals/bench/pack-bench.mjs`,
When it runs,
Then it reports three arms per term — bounded `rg`, narrow `pack`, and full `pack` — with recall
for each. The full-`pack` arm keeps its current name, its current computation and its place in the
summary line, so the 5,743 recorded on 2026-09-08 and the 4,102 recorded on 2026-09-10 remain
directly comparable to it. On this repository's six own terms the narrow arm costs less than
bounded `rg` at equal recall, and the benchmark's own `recall >= 0.9` exit gate is unchanged in
threshold, in what it grades and in what it prints.

### B3

Given the "Code property graph" entry of `docs/IMPROVEMENT-PLAN.md`,
When a reader reaches its conclusion that the benchmark is "evidence for cutting",
Then a correction sits with it stating what the 2.01x actually measured: that `pack` was charged
for callers and callees the benchmark gave it no credit for, that callers alone were 2,302 of
3,846 tokens, and that the same-question comparison is 1,190 against 1,771 — the graph a third
cheaper, not twice the price. The original figures stay on the page. The correction does not claim
the graph is vindicated overall: it says the comparison that argued for cutting was uneven, and
that no product comparison has been run.

## Design

`pack(cfg, g, term, { budget, breadth })`, where `breadth` defaults to the value that produces
today's output. The narrow value stops after the definition and skeleton pieces and never collects
callees or callers. Nothing about budgeting, ordering, truncation or rendering changes; the option
gates which kinds are collected and nothing else.

The bench grows a third arm computed the same way as the existing one, differing only in the
`breadth` it passes. The summary line keeps reporting the full arm, and the per-term table gains a
column. Retaining the full arm is not politeness: it is what keeps every figure already recorded
readable against the code that produced it, which is the same rule the repository applied when it
refused to rewrite the graph row after the freeze reversal.

The rejected alternative is making narrow the default. It is tempting because it makes the
headline number better, and it is wrong: `.claude/CLAUDE.md` documents `harness pack <symbol>` as
"budgeted definition, callees, callers", three callers depend on that, and an agent about to
change a symbol wants its callers most of all. Changing a default to improve a benchmark is the
behaviour this repository's own exit criterion exists to prevent.

## Out of scope

- `pack`'s default breadth, its budget, its ordering, its truncation and its rendering.
- `pack-bench.mjs`'s exit criterion, threshold and pass/fail semantics.
- Any change to the graph, its edges, its ranking or its audit.
- The unrun graph-first versus Grep-first product comparison. This change makes a deterministic
  measurement honest; it does not substitute for a product one, and B3 says so on the page.
- `.aidlc/baseline.json`'s `pack_tokens_p50`, which must keep measuring the default breadth.

## Safeguards

- The full arm stays, so nothing already recorded becomes unreadable or incomparable.
- The default stays, so no consumer of `pack` changes behaviour and `pack_tokens_p50` keeps
  measuring the same thing.
- B3 forbids the correction from over-claiming: it corrects a comparison, and states that the
  product comparison remains unrun.
- The exit gate is untouched in threshold and in meaning, so this change cannot be read as having
  lowered a bar it failed.
