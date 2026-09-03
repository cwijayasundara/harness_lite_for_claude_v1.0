# Intent: lean-v2

- **Date:** 2026-09-03
- **Opened at:** 2026-09-03T16:30:44.894Z
- **Author:** cwijayasundara (analysis by Claude Fable 5.1)
- **Status:** draft <!-- draft | accepted | closed -->
- **Source:** conversation 2026-09-03; analysis at https://claude.ai/code/artifact/00104ecf-7504-4b95-86e6-708a1764ebe1

## Problem

The harness has re-grown the surface v6 had, in miniature. Of ~4,800 kernel lines, ~2,700 are
reachable from no stage: a Jira port, a Docker deploy port, monitoring and incidents, adapters for
four other coding agents, model-handoff receipts, a second sensor runner, playbook indicators and
an eval overlay ratchet. 142 of 181 commits are artifact ceremony. The ledger has 3,040 rows and
has never justified a deletion; the one time it named a control, the verdict was renamed. The
generator/evaluator split is configuration nobody invokes. The code map is stale on the harness's
own tree and nothing reports it. Four documents state four different skill budgets.

The cause is that the harness has only ever governed itself. Every control was motivated by a
harness defect, so controls compound on controls, and the process is calibrated for two-line
registry edits rather than product features.

## Proposed outcome

A harness whose every kernel line is reachable from a stage, whose artifact chain is the
playbook's three files with three human gates, whose generator and evaluator are different models
in different contexts by construction, whose code map cannot go stale silently, and which has
built a real application through itself for three sprints before the next control is added.

## Affected users and systems

- The single maintainer, who currently types the last line of every registry change by hand.
- Anyone installing the harness into a project: fewer verbs, one budget number, three artifacts.
- CI: gains an `ANTHROPIC_API_KEY` and runs evals and the evaluator on steering changes.

## Constraints

- Zero dependencies in the harness remain. The example app may have its own.
- No self-exemption: this change goes through the current chain, and it is the last contract in
  the current format.
- Main is never red for longer than one PR. Ledger history is preserved.
- Nothing deleted is parked on a branch. Git history is the archive.

## Open questions

None blocking. Decided 2026-09-03 by the owner: three playbook files (yes); API key in CI (yes,
Haiku 4.5 for generator and eval runner, Opus 5 / Sonnet 5 for evaluator); drop Codex, Cursor,
Copilot, Grok adapters (yes, control plane stays neutral); delete rather than branch (yes);
example app chosen in the contract.
