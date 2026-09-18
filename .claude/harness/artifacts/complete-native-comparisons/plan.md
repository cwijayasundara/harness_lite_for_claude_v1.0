---
status: approved
by: cwijayasundara (conversation authorization, recorded by Codex)
at: 2026-09-07T14:30:55.637Z
digest: sha256:c4d575ffad30ab01daab550db3b17bc10628636d15077d4a04b56881aeb3db0c
spec_digest: sha256:0870c8dd9a85a6aa9937626b625f3ba0ab16cf000ac5d5ccf6593dc24a1c6858
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
