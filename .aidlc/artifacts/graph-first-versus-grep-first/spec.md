---
status: draft
extends: graph-first-retrieval
source: docs/IMPROVEMENT-PLAN.md
source_revision: 29672945f7595d50b00bfc464e957a377a2fe553
parent: lean-review-graph-retrieval
---
# Spec: graph-first-versus-grep-first

## Outcome

The graph row's condition becomes runnable and then run. Two arms differ in how
the agent is told to find code, not in what is pasted into its prompt; a product
makes finding it the hard part; the paired run happens inside an authorised
ceiling; and the review records the outcome, including a tie or an incomplete
run, with the sample's limits stated. Nothing is removed on the strength of it.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| review:graph-first-versus-grep-first-product-comparison | B1, B2, B3 |
| review:advisory-packing-is-not-that-comparison | B1 |
| review:runtime-removal-experiments-not-validated | B4 |
| local:one-ledger-figure-with-its-date | B5 |

## Observable behaviours

### B1

Given `node evals/run.mjs --compare --comparison retrieval`,
When the pair is built,
Then it has two arms, `grep-first` and `graph-first`, and neither receives a
rendered pack in its prompt. `grep-first` receives today's instruction to use rg
and bounded reads. `graph-first` is instead told to locate with
`harness graph query` and `harness pack` first and to treat search as the miss
path, and has a built index it can query in its work directory. The existing
`native`, `graph` and `generation` pairs are unchanged, and running without
`--comparison` still runs the pairs it runs today.

### B2

Given the product the retrieval pair runs against,
When a step asks for a change,
Then locating the code is the work: the product spans enough modules that the
file to change cannot be guessed from the request, and it contains at least one
symbol name that appears in more than one module so that a careless lookup lands
in the wrong place. The product is new, under `evals/fixtures/`, with its own
tests that fail before each step and pass after; no existing fixture is edited.
A model doing nothing fails its assertions.

### B3

Given the authorised ceiling of USD 10 and 40 minutes,
When the paired run executes,
Then it stops at whichever bound it reaches first, and every attempt is
recorded — passed, incomplete, unmeasured or abandoned — with reported spend,
latency, accepted changes and retries per arm. Portable outcomes are written
under `evals/evidence/`. If the arms tie, the record says they tied on a task
built to discriminate; if the run is cut short, the record says which attempts
never ran, and no result is reported as complete.

### B4

Given the lean-review graph row and the review's closing paragraphs,
When a reader asks what is known about removing the graph,
Then the row records the comparison's outcome and the date it was run in place
of its former condition, and states that a comparison is not a removal decision.
The closing paragraph names which removal experiments are validated — the
session-inventory pruning pair, complete at 11 of 11 both arms — and which are
not, so "removal experiments remain recommendations" is replaced by a statement
of what was actually tried. The structural finding stands recorded either way:
the former `graph` pair measures injected context, not retrieval, and the
earlier four-arm saturation at 33 of 33 is why a new product was needed.

### B5

Given the 8 September 2026 review section,
When it states the size of the local ledger,
Then it states one figure for one thing, or each figure carries the date it was
taken. The undated "7,493 rows over 593 runs" no longer stands beside the dated
2026-09-09 snapshot as an unexplained second number.

## Design

The pair is three lines in `comparisonPairs` and one branch in the campaign
step. The branch replaces the prompt's retrieval sentence for the `graph-first`
arm and builds the index in the work directory rather than rendering a pack into
the prompt; `config.graph`'s existing injection path is left exactly as it is,
because the `graph` pair's recorded history depends on it and this change does
not reinterpret past evidence.

The harness is already installed in a comparison work directory — the campaign
writes approval artifacts there and asserts against them — and product
comparison arms already run with Bash allowed, so `graph-first` can query the
index through the same command a real agent would. If that turns out not to hold
in the work directory, the fallback is to expose the query as an explicit
command in the arm's instruction rather than to inject its output, since
injection is the thing under test.

The discriminating product is the larger half of the work and the reason this
change is bigger than the rest of the review's follow-ups. Its shape follows the
existing campaign products — a small application with steps, behaviours, scoped
files and its own test command — and differs only in being wide enough that
retrieval matters.

The rejected alternative is running the retrieval pair against the existing
products. It is cheaper and it is what the ceiling would comfortably cover, but
four arms already saturate at 33 of 33 there, so it would buy a tie that says
nothing about retrieval. The user chose against it on 2026-09-09.

## Out of scope

- Removing, disabling or shrinking the graph, the map or `harness pack`. This
  change produces evidence; acting on it is a separate decision.
- Any change to `.aidlc/` runtime behaviour, controls, hooks, skills, agents,
  verbs or `[limits]`.
- Reinterpreting or rerunning the earlier native, graph or generation
  comparisons, or editing their recorded evidence.
- Editing existing fixtures.
- A statistical reliability claim. The sample is small and the record says so.
- Real human approvals inside the campaign; they stay driver-owned and
  simulated, as in every previous comparison.

## Safeguards

- The ceiling is enforced by the runner, not by attention: the run stops on
  budget or deadline and records what did not run.
- No fixture already under `evals/fixtures/` is edited, so no existing eval
  changes meaning.
- The `graph` pair and its injection path are untouched, so previously recorded
  comparisons remain readable against the code that produced them.
- Failed and interrupted attempts are retained in the evidence rather than
  pruned, matching how the earlier comparisons recorded theirs.
- `test/ledger-evidence.test.mjs`, `test/skills-context.test.mjs` and
  `test/host-evidence.test.mjs` keep passing unedited; this change touches none
  of the surfaces they freeze.
- A tie and an incomplete run are both reportable outcomes, so there is no
  pressure on the run to produce a difference.
