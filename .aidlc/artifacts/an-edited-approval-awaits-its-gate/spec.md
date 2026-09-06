---
status: draft
---
# Spec: an-edited-approval-awaits-its-gate

## Outcome

Editing an approved artifact of an open change suspends product writes until a gate has looked
at the edit. An edited approval cannot hand governance to an older plan.

## Observable behaviours

### B1 — a stale approval on an open change awaits its gate

Given an open change whose `spec.md` or `plan.md` reads `stale-approval`,
When a product file is written,
Then the write is refused. The refusal names the change and the artifact, and says: re-approve
it (`harness approve <slug> spec|plan`), or restore the approved text; and that a reversal of
an approved behaviour belongs in a new change with `supersedes:`. It does not name
`require_contract`.

### B2 — the stale change does not step aside

Given the same repository,
When `governingPlans()` is asked,
Then it returns nothing while the stale approval stands, whatever older approved plan exists.

### B3 — a closed change's edits are history

Given a closed change whose approved artifact is edited,
When a product file is written,
Then that change is ignored, as today.

### B4 — scope-drift asks the same question

Given a working diff touching product files and an open change with a stale approval,
When `scope-drift` runs,
Then every product file is a finding with rule `draft-awaits-gate`, naming the change and the
artifact.

### B5 — the stale change is visible

Given an open change with a stale approval,
When `harness status` runs and when a session starts,
Then the `awaiting gate` line names it and the artifact: `awaiting gate 1: <slug> (spec edited
after approval)` or `awaiting gate 2: <slug> (plan edited after approval)`.

### B7 — a placeholder in the template's frontmatter is not a body marker

Given `.aidlc/templates/spec.md` carrying `<slug>` inside its frontmatter comment,
When `templateMarkers('spec', body)` runs on a spec whose prose mentions `<slug>`,
Then it reports nothing: only placeholders in the template's *body* are scaffold markers. Found
while drafting this spec, which `draftsAwaitingGate` did not list and approval would have
refused as an unedited scaffold.

### B6 — the campaign proves it

Given `campaign-ledger` sprint 3 under the unattended runner,
When the agent edits an earlier sprint's approved spec and then writes product code,
Then the write is refused naming that spec, and the sprint cannot end green without either
re-approving it — at which point a named id must be linked — or writing a new change.

## Out of scope

- Refusing the edit itself. Artifacts stay writable: a human amends by editing and
  re-approving, and so does the unattended runner.
- Any change to what `stale-approval` reports elsewhere.

## Safeguards

- Existing `stale-approval` tests in `test/lifecycle-cli.test.mjs`, `test/scope-drift.test.mjs`
  and `test/current-change.test.mjs` pass unchanged.
- `draftsAwaitingGate()` stays the single list the guard, the check and both reporters read.
