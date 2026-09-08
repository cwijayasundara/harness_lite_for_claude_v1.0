---
status: approved
by: cwijayasundara (item 4 completion authorization, recorded by Codex)
at: 2026-09-08T05:59:10.004Z
digest: sha256:07859bff9aa1a47efa8a6362381c73937fd562b8e70514edddca88365d76e659
spec_digest: sha256:f47805fb59eb61c895e17194dd70ca56cd24fd349ed742cd05c09821ce341725
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
