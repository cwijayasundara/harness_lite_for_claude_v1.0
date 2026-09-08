---
status: draft
---
# Plan: correct-paid-rule-heuristic

## Approach
Reproduce the exact false block with a regression test, narrowly recognize its explicit paid
conditional, and verify contrary statements remain rejected. Retain all live evidence and
finish the already authorized comparison delivery without rerunning successful model trials
solely to remove an observer-caused repair from the record.

## Files
`evals/lib/assertions.mjs`
`test/comparison.test.mjs`
`evals/README.md`
`docs/IMPROVEMENT-PLAN.md`
`.aidlc/evals/comparison-summary.json`

## Proof
| Behaviour | Evidence |
|---|---|
| B1 | test/comparison.test.mjs; saved candidate regrade |
| B2 | .aidlc/evals/comparison-summary.json; completion evidence.md |
