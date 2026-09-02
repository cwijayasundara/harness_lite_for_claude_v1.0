# Intent: scope-drift-reads-every-contract

- **Status:** approved
- **Author:** cwijayasundara

## Problem

The write guard and the commit check disagree about what "owned" means.

`contractScopeState` (`.aidlc/lib/guard.mjs:19`) aggregates owned paths across **every** valid,
approved, committed contract. `scope-drift` (`.aidlc/checks/scope-drift.mjs:51`) picks exactly
**one** contract — the dirty one, else the most recently modified — and validates the whole
working diff against that contract alone.

CLAUDE.md states the rule the guard implements: *"product file edits need a committed approved
contract that owns the path."* Not "owned by whichever contract was touched last."

Observed: recording `evals/expected.json`, a file `eval-ratchet` explicitly owns, failed
`--stage commit` because scope-drift happened to select `recalibrate-eval-budgets`:

```
FAIL  scope-drift
      evals/expected.json  changed but not named in
      .aidlc/artifacts/contracts/recalibrate-eval-budgets.md
```

The guard, asked about the same path, answers "no — it is owned".

The single-contract assumption held when the repository had one contract. It now has seven, and
any change touching a file owned by an earlier one fails a check that the guard permits. That is
worse than either rule alone: a gate that contradicts the guard teaches people to distrust both.

## Outcome

`scope-drift` and the write guard answer the same question the same way, and a file owned by any
approved committed contract does not fail the commit stage.

## Affected systems

`.aidlc/checks/scope-drift.mjs`, and `test/scope-drift.test.mjs`.

## Constraints

Widening what counts as owned must not lose the two signals scope-drift exists to give: a file
owned by no contract at all is still a finding, and a contract being written *now* that is
invalid or not plan-approved is still a finding. The `contract-scope-honesty` eval depends on the
second and must still fail afterwards.

The legacy-plan fallback is not touched here; it belongs to the legacy-lifecycle deletion.

## Open questions

Aggregating across all contracts is weaker than requiring a change to be governed by *its own*
contract. The stronger rule is not implementable without knowing which contract a given commit
belongs to, which the artifact chain does not currently record on the diff. Worth revisiting if
contracts ever carry a branch or commit range.
