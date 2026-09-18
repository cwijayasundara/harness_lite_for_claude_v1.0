---
status: approved
extends: one-integration-test, the-suite-measures-this-harness
by: cwijayasundara
at: 2026-09-06T07:41:04.389Z
digest: sha256:a22382c408d6d54ffc40e7638af5cde9cd9a0f1c976cf292f937407d052d7802
---
# Spec: a-change-declares-its-relation

## Outcome

No spec is approved beside other open, approved specs without saying what it does to each of
them. The record of a reversal is written at gate 1 or the gate does not open.

## Observable behaviours

### B1 — a relation is required for every other open approved change

Given a spec being approved, and one or more *other* changes that are not closed and whose
spec is approved,
When `harness approve <slug> spec` runs,
Then it is refused unless, for each such change, the frontmatter either names one of its
behaviours in `supersedes:` or names the change in `extends:`. The refusal lists the changes
still unrelated and shows both lines.

### B2 — extends: is validated

Given an `extends:` entry,
When the spec is approved,
Then the named slug must exist and its spec must be approved. A slug that does not is refused,
naming it.

### B3 — one change alone declares nothing

Given no other open change with an approved spec,
When a spec is approved,
Then nothing is required and nothing changes.

### B4 — a closed change needs no relation

Given a closed change with an approved spec,
When another spec is approved,
Then the closed change is not listed.

### B5 — the field is introduced where the agent writes

Given `.aidlc/templates/spec.md` and `.aidlc/skills/spec/SKILL.md`,
When a spec is scaffolded or the skill is read,
Then both name `extends:` beside `supersedes:`, in one sentence each: extends when the earlier
change's promises all still hold, supersedes when one does not.

### B6 — the campaign proves it, either way

Given `campaign-ledger` sprint 3 under the unattended runner,
When the agent approves its spec beside sprints 1 and 2,
Then approval is refused until it declares a relation to each, and the run records which it
chose. `supersedes:` passes the existing assertion; `extends:` for a reversal fails it and is
recorded as a finding about the model.

## Out of scope

- Judging whether `extends:` is true.
- Reporting `extends:` in `status` or at session start. It is a record; nothing acts on it.
- Plans and intents.

## Safeguards

- `test/supersedes.test.mjs` and `test/gate-content.test.mjs` pass unchanged; their fixtures
  approve a spec with no other open approved change beside it.
- `parse()` already reads any `key: value` line, so the field needs no parser change.
- This spec declares `extends:` for the two open changes of this repository, so it can be
  approved under its own rule once the rule lands, and under the old rule before.
