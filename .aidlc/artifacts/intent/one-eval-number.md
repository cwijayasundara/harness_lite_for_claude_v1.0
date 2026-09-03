# Intent: one-eval-number

- **Status:** approved
- **Author:** cwijayasundara

## Problem

The status board and the eval gate report different numbers for the same thing:

```
harness evals gate    22/22   widest run plus six correcting runs
harness status        18/22   widest run only
```

`latestEval` (`indicators.mjs`) reads `widestResults` — one file. `loadResults` (`eval-gate.mjs`)
reads the same file and then overlays later narrow runs, which is how a task repaired by a
one-task re-run gets its verdict corrected without paying for a full suite.

Neither is wrong on its own terms. One means "the score of the most complete single run", the
other "current best knowledge per task". But a board that disagrees with the gate teaches people
to trust neither, and the number a person reads first is the one on the board.

This is the fifth time in this repository that two components have answered the same question
differently: `bashContractBlocked` against `bashTouchesProtected`, `lifecycle` against the
contract chain, the write guard against `scope-drift`, stage-only against hook-bound wiring, and
now this.

## Outcome

One reading of the eval results, shared by the board and the gate.

## Affected systems

`.aidlc/lib/indicators.mjs` and `.aidlc/lib/eval-gate.mjs`.

## Constraints

The widest run stays the base. A narrow smoke run must not become the board's score, which is the
rule `eval-ratchet` was built around and `overlay-narrow-eval-runs` preserved.

`eval-gate.mjs` already imports from `indicators.mjs`; the shared reader has to live on that side
of the dependency or the two modules import each other.

## Open questions

Whether the board should show how many runs its number came from, as the gate does
(`+6 correcting runs`). A single number assembled from seven runs is honest but not obviously so.
