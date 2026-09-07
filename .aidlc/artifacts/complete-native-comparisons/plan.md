---
status: draft
---
# Plan: complete-native-comparisons

## Approach
Add a selector to the existing runner to retry only an affected comparison. Keep campaign and
invocation semantics identical across arms. Complete the matrix, inspect saved outcomes, and
publish portable evidence and the item 4 decision under the user's merge/push authorization.

## Files
`evals/lib/comparison.mjs`
`evals/run.mjs`
`test/comparison.test.mjs`
`evals/README.md`
`docs/IMPROVEMENT-PLAN.md`
`.aidlc/evals/comparison-summary.json`

## Proof
| Behaviour | Evidence |
|---|---|
| B1 | test/comparison.test.mjs; CLI dry runs and rejected selectors |
| B2 | .aidlc/evals/comparison-summary.json; evidence.md; full checks |
