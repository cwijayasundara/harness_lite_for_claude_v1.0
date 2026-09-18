---
status: approved
extends: ledger-evidence-not-reporting
source: docs/IMPROVEMENT-PLAN.md
source_revision: 088a3a0911faba198a79a7431185a270b85d64dc
parent: lean-review-ledger-evidence
source_digest: sha256:0d9cc699d095a9f24491c16926eb66c611ba474af1805c5636414b32c1321ef5
source_kind: repository
intent_digest: sha256:ad02032618155ec39d07a61b9beb57279906311220541fe29d6fd15b4d5775af
intent_input_digest: sha256:bf83eda093120db76b1d9620a79978dbf850407d7e3ec4cea7f4c56955332b45
intent_revision: 983cde5bec2b47708d08be86a2e0c4f8bdb8cfb7
by: cwijayasundara
at: 2026-09-09T05:08:41.544Z
digest: sha256:f933c8b8f77da8f28a28b5bba8b7c460dd7b6daa76d3969db5a2bf47ecff3227
approval_version: 2
approval_digest: sha256:2fc1867e1657679050ef182d7dea26b96604473dcbbfca3f333791e76562219b
---
# Spec: a-block-names-its-rule

## Outcome

A block the harness records can be named, so a human who judged it wrong can say
so and the audit can see the answer. The tags the guards already build reach the
ledger row instead of stopping at the operator's screen, and `write-guard` gains
the one it never had. What is measured does not change; what was already
measured becomes reachable.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| review:F2-54-blocks-cannot-be-flagged | B1, B2, B3 |
| local:change-what-a-block-is-called-not-whether-it-happens | B4 |

## Observable behaviours

### B1

Given a stage-run control that fails — `test`, `scope-drift` or `tamper` —
When the runner appends its ledger row,
Then the row carries the `rule` its first reported finding names: `test-failed`
for a failing suite, and for the others the tag the check already built, one of
`scope-drift`, `unkept-proof`, `draft-awaits-gate`, `no-approved-plan`,
`no-current-change`, `plan-scope-missing`, `bare-suppression`,
`raised-threshold` or `deleted-test`. A control whose findings name more than one
rule records the first, which is the one the operator reads first; a control
that reports no rule records none, exactly as now.

### B2

Given a write the pre-write guard refuses,
When it appends its ledger row,
Then the row names which refusal fired, distinguishing at least a protected
agent-instruction or permission path from a path outside the current change's
approved scope. `writeBlocked` returns that name alongside the message it
already returns, its callers receive the same refusal text as before, and a
permitted write still returns no refusal and appends a passing row with no rule.

### B3

Given rows recorded under B1 and B2,
When a human runs `harness ledger flag <rule>` for one of those names,
Then the matching block is marked, exactly as it already works for
`bash-guard`'s rules: the flag sets only the `false` field and leaves verdict,
rule, timestamp and run as the guard wrote them. `harness ledger audit` lists
those rules under their control with fire and false counts, and marks one noisy
when more than half its fires of at least three were called wrong.

### B4

Given every guard and check in the harness,
When this change is applied,
Then nothing blocks that did not block before and nothing is permitted that was
refused before; passing rows still carry no rule; the ledger row schema gains no
field, the `KILL` thresholds, the verdict set and the `harness ledger`
subcommands are unchanged, and no benefit, score or saving is recorded anywhere.
Historical rows are not rewritten, so the 54 blocks already recorded without a
rule stay as they are and remain visible as history.

## Design

The tags exist; only the plumbing is missing. `.aidlc/lib/runner.mjs` already
receives each control's findings and prints `f.rule` to the operator, and it
appends the ledger row a few lines later — the row takes the rule from the same
findings array. That single change covers `test`, `scope-drift` and `tamper`
together, and any future check that tags its findings, which is why it is
preferred over touching three checks.

`write-guard` is the exception, because `writeBlocked` in `.aidlc/lib/guard.mjs`
returns only a refusal string. It returns a name with it, and
`.aidlc/hooks/dispatch.mjs` passes that name to `ledger.append`. Changing a
return type touches `test/guard.test.mjs`, which asserts on the refusal text in
several places; those assertions keep their exact meaning and read the message
from the new shape.

Recording the first finding's rule rather than all of them is a deliberate
limit. One block is one row, and a human calling a block wrong is calling wrong
the thing they were shown first. Recording a list would make the row a summary
and the per-rule split ambiguous. The limit is stated where the row is built.

The rejected alternative is backfilling a rule onto the 54 rows already
recorded. `flag()` is the only write to an existing row and it exists so the
record of what fired stays exactly as the guard wrote it; inventing a rule for a
past block would put a guess into evidence.

## Out of scope

- Changing what any guard blocks, or the text of any refusal.
- New rules, controls, hook bindings, thresholds, verdicts or subcommands.
- Rewriting or migrating historical ledger rows.
- Anything the `ledger-evidence-not-reporting` freeze forbids: a benefit, score,
  saving or ROI field, a reporting or publishing path, a new ledger export.
- A second rule per row, or a rule on a passing row.
- Paid product trials.

## Safeguards

- `test/ledger-evidence.test.mjs` must keep passing unedited; if this change
  needed that lock relaxed, it would be the wrong change.
- `test/guard.test.mjs` keeps proving every refusal it proves today, including
  the nested-copy and prompt-prefix cases, with equivalent assertions on the
  message.
- Existing `bash-guard` and `map-drift` rule names are untouched, so the audit's
  history under them stays comparable across this change.
- A guard that throws must not become a guard that blocks: the rule is read
  defensively from findings that may be absent or untagged.
