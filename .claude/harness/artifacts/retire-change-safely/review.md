---
status: draft
---
# Review: retire-change-safely

Written by the evaluator against `spec.md` and `.aidlc/policies/review.md`. Every finding cites a
behaviour id or a review pass, and carries a severity.

## Sentence mapping (B1, B2)

Taken 2026-09-09 against `change-safely` at `ebca423`, sentence by sentence,
against `implement`, `map`, `spec`, `intent` and `diagnose`. This is the safety
argument for the deletion and was completed before the file was removed.

### Already stated elsewhere — deleted with the file

| Rule in `change-safely` | Stated in |
|---|---|
| Understand affected behaviour, callers, dependencies and state before editing | `implement` "Read the current spec, plan, relevant code and tests… Understand state and failure paths"; `map` entire |
| Locate callers with `harness graph query` / `harness pack` before whole-file reads | `implement` "Locate callers and definitions with `harness pack` / `graph query` before reading whole files; Grep is the miss path"; `map` entire |
| Read nearby implementations and tests for established patterns | `implement` "follow existing patterns where they fit" |
| A pure refactor may still need test maintenance | `implement` "Tests may change for an approved requirement, corrected test defect, renamed interface, moved fixture or improved assertion" |
| Renames, imports, fixture setup and internal coupling may need maintenance | `implement`, same sentence |
| Keep equivalent or stronger assertions and explain the adjustment | `implement` "Explain why the edit still proves the intended behaviour and retain relevant regression coverage" |
| Do not weaken acceptance criteria to get green | `implement` "Do not delete assertions, relax thresholds or rewrite expected results merely to hide a failure" |
| A test change altering the product contract needs the spec and human approval | `implement` "If the expected behaviour is uncertain, ask the human" and "Material design, behaviour, safeguard or scope changes return to the human" |
| Prefer existing patterns and small, reviewable diffs | `implement` "follow existing patterns where they fit" and "Work in small behavioural slices" |
| Run the affected runtime path and regression suite; say what remains untested | `implement` "Exercise the affected runtime path… Report anything the environment prevents you from verifying" |
| Honour approved file scope, test locks and external evaluation ownership | `implement` "Never write outside `## Files`" and "Respect explicit test locks and externally owned evaluation fixtures" |
| An authorized reversal belongs in a new spec with a supersedes link | `spec` "**Supersedes.**" |
| Record design/architecture continuity with `extends` | `spec` "Use optional `extends: <slug>`" |
| Consult revision-specific product context; preserve its unknowns | `map` "## Revision-specific product context" |

### Harness-specific, no home — moved to `implement` (B2)

| Rule | Nearest existing text, and why it is not the same rule |
|---|---|
| Distinguish a preserved contract from a defect the approved change is meant to fix | `implement` and `plan` speak of reusing tests that prove preserved behaviour — test reuse, not telling a contract from a defect |
| Fix an in-scope defect after reproducing it; record unrelated bugs for separate work | `diagnose` covers reproduce-then-fix; the in-scope qualifier and deferring unrelated bugs appear nowhere |
| Fix an implementation bug to meet the approved requirement rather than synchronising the bug into it | nothing |
| Approval alone does not retire delivered behaviour; historical permission never authorizes a new change | `intent` says existing authorization is context, not a reason to re-ask — "don't re-ask", not "don't over-claim" |

### Generic, no home — deliberately dropped

- Use coverage to locate risk; inspect assertions rather than treating a percentage as proof.
- Characterisation records reality, including surprising behaviour.
- A separate test commit is useful when it improves review but is not required.
- A tested helper or seam can reduce risk without a one-line integration rule.

None names anything in this harness, and no recorded defect motivates any of
them. They are the class the review's criterion excludes.

### F1 — the finding this change rested on undercounted

`skills-earn-their-context`'s F2 reported one unduplicated rule. It counted rule
families by reading; counted by sentence there are four. The spec and plan were
amended and both approvals re-sought before implementation, and the deletion's
margin is recorded as smaller than the original finding claimed rather than
carried forward at the old number.

## Findings

| Severity | Cites | Finding |
|---|---|---|

## Evidence and uncertainty

<Checks actually observed, unverified paths and limits of the review. Do not claim tests ran
without evidence. The caller runs checks separately from the evaluator.>

## Recommendation

<approve | changes-requested, and why in one sentence.>

## Design and delivery context

Classify discrepancies as authorized rule changes, preserved-behavior refactors, or bugs to fix
against the approved contract. Cite source/behavior and design references at exact revisions.
Inspect `harness graph query product --revision <commit>` where delivery records exist; retain
unknown coverage and conflicts. Approval is a proposal, integration is repository state, and
neither establishes deployment. Do not infer executed proof from a filename or graph edge.
