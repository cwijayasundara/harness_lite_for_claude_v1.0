# Intent: sensors-measure-product-code

- **Date:** 2026-08-24
- **Opened at:** 2026-08-24T21:52:19+01:00
- **Author:** cwijayasundara
- **Status:** draft <!-- draft | approved | closed -->
- **Source:** conversation — Robert C. Martin's position on not reading agent-written code, compared against what this harness actually measures

## Problem

The harness budgets itself and measures nothing about the code it is supposed to govern.

`[limits]` in `harness.toml` caps skills, agents, hook bindings, hook lines and `CLAUDE.md` lines.
Every one of those is a *harness* surface. There is no limit on a product file's length, no limit
on a function's length, no complexity threshold, no dependency-structure check, and no mutation
testing. The `arch` and `coverage` verbs exist in the registry and ship empty.

Martin's argument for not reading agent-written code is not "trust the agent". It is that agents
should be surrounded by extreme constraints — unit tests, acceptance tests, QA procedures,
cyclomatic complexity thresholds, module size limits, dependency structure analysis, mutation
testing, coverage — and that the human's attention moves up to reviewing the acceptance criteria
rather than the code.

This harness already implements the upper half of that well. Three human gates, `spec.md` as
numbered testable behaviours, `plan.md` mapping each behaviour to the test that proves it, and
`plan-drift` enforcing the file list — that is reviewing intent instead of lines. What is missing
is the lower half: nothing stops an agent from satisfying every behaviour with a nine-hundred-line
function, and nothing would notice.

The gap is not theoretical for this repository specifically. The change reviewed immediately before
this intent found four defects that no sensor caught, in a codebase of 2,500 lines where every
control is about the harness's own shape.

## Proposed outcome

The sensors measure the code the team writes, not only the harness that watches it.

- A change that adds a function longer than the project's declared limit, or a file longer than it,
  fails a check — with the limit stated in `harness.toml` like every other threshold.
- Cyclomatic complexity above a declared threshold fails the same way.
- Import cycles in product code are reported. The graph already computes them; nothing consumes the
  answer as a control.
- Coverage has a floor, and a change that drops below it is a finding rather than a note.
- Every one of these is `n/a` rather than red when the toolchain cannot measure it — see
  [[toolchain-gap-reads-as-regression]], which must land first or this intent multiplies the defect
  it describes by four.
- The harness's own budget is unchanged: no new hook binding, no new agent, no new skill. The
  budget is full at 12/3/5 and this change must fit inside it.

## Affected users and systems

- `.claude/harness.toml` — `[limits]` gains product-code entries; the `arch` and `coverage` verbs
  gain meaning.
- `.claude/checks/` — one new check, or an extension of the budget check to a second subject.
- `.claude/lib/graph.mjs` — `query cycles` exists and is currently reachable only by hand.
- `.claude/lib/config.mjs` — limit defaults.
- Every project that installs the harness, which inherits whatever defaults are chosen here.

## Constraints

- Zero dependencies. Complexity and length must be computed from what the harness already has, or
  delegated to a project-supplied `arch` command — not to a new library.
- The budget is full. This must not add a hook binding, an agent, or a skill.
- Adding one sensor at a time, and letting `ledger audit` delete the ones that never fire. The
  predecessor harness became unusable by accumulating controls; the ledger is the mechanism that
  makes growth here survivable, and skipping it is how this intent turns into that.
- Defaults must be defensible for a project the harness has never seen. A limit inherited at
  install time that immediately fails an existing codebase will be raised rather than obeyed, and a
  threshold everyone raises is a threshold that does nothing.

## Open questions

1. What are the actual numbers? Thirty lines a function and three hundred a file were the figures
   discussed. Are they the defaults every installing project inherits, or a suggested starting
   point in the template with no default enforcement? **Author.**
2. Does the harness compute length and complexity itself, or does it delegate to the `arch` verb
   and stay language-agnostic? Computing it means a parser per language, which is the tree-sitter
   decision in `docs/BUILD-PLAN.md` Phase 3 all over again; delegating means every project must
   find a tool, and projects without one measure nothing. **Author — this is the design fork.**
3. Existing code will breach any threshold worth setting on day one. Is the limit applied only to
   files the change touches, ratcheted against a captured baseline like the cost metrics, or
   enforced outright with a documented exemption list? **Author.**
4. Mutation testing is the strongest answer to "are these tests real", and the slowest. Does it
   belong in `drift` as an occasional signal, or nowhere until something asks for it? **Author.**
5. Is the ceiling on complexity a *budget* — one number for the project, like skills 12/12 — or a
   *per-unit* threshold? The budget framing is this harness's characteristic move and would make
   adding a complex function require simplifying another. It is also much harsher. **Author.**
