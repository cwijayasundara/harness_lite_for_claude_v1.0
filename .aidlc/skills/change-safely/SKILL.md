---
name: change-safely
description: Guides safe changes to existing code through system understanding, meaningful regression coverage, narrow seams and behaviour-preserving refactors. This skill should be used before modifying any existing code, whenever working in an unfamiliar or legacy area, and whenever a change is described as cleanup, tidying, restructuring, renaming, extracting, or moving code.
---

# Change existing code safely

Understand the affected behaviour, callers, dependencies and state before editing. Locate
callers with `harness graph query` / `harness pack` before whole-file reads. Read nearby
implementations and tests for established patterns. Use coverage, when available, to locate
risk; inspect assertions rather than treating a percentage as proof.

| Situation | Approach |
|---|---|
| Meaningful coverage exists | Run the relevant checks before and after the change. |
| Assertions miss affected behaviour | Add focused behavioural coverage. |
| Important behaviour is untested | Run it and pin the load-bearing cases before changing it. |
| Code is too tangled to exercise safely | Find a narrow seam and test the new behaviour there. |
| Behaviour must remain unchanged | Refactor in small steps and preserve observable contracts. |

Characterisation records reality, including surprising behaviour. Distinguish a preserved
contract from a defect the approved change is meant to fix. A separate test commit is useful
when it improves review, but is not required for every change. Fix an in-scope defect after
reproducing it; record unrelated bugs for separate work.

A pure refactor preserves observable behaviour, not necessarily test source text. Renames,
imports, fixture setup and tests coupled to internals may need maintenance. Keep equivalent
or stronger behavioural assertions and explain the adjustment. Do not weaken acceptance
criteria to get green. If a proposed test change alters the product contract, check the spec
and obtain human approval when that change is outside its boundary.

Prefer existing patterns and small, reviewable diffs. A tested helper or seam can reduce risk
without imposing a one-line integration rule on every legacy change. Run the affected runtime
path and regression suite; say what remains untested. Honour the approved file scope, test
locks and external evaluation ownership throughout.

Keep design history: an authorized reversal belongs in a new spec with a supersedes link;
a refactor retains behavior tests and records affected design/architecture references with
extends where applicable. Fix implementation bugs to meet the approved requirement rather
than synchronizing the bug into it. Consult revision-specific product context when recorded
delivery evidence exists, and preserve its unknowns. Approval alone does not retire delivered
behavior, and historical permissions never authorize a new change.
