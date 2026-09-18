---
status: closed
---
# Intent: a-named-behaviour-is-a-link

- **Date:** 2026-09-06
- **Author:** cwijayasundara
- **Source:** `.aidlc/artifacts/one-integration-test/evidence.md` F31 — the second instance of
  F9, on run 2 of the five-sprint integration test.

## Problem

`a-spec-can-be-superseded` gave a spec a `supersedes: <slug>#B<n>` field because F9 showed an
agent that had found the contradiction, named the behaviour, and had nowhere to write it. Run 2
of the campaign shows the field is not reached either. Sprint 3 wrote, in its spec's prose,
"the contradiction with add-balance-overdue#B12" and "the earlier spec's behaviour is being
superseded", approved the spec itself, and left the frontmatter without the line. Nothing was
superseded. `harness status` still shows sprint 1's promise as standing, and the campaign's
assertion is red.

The agent had made the judgment. It wrote the exact id. The template's reminder about the field
is the last paragraph of the body, and the agent answered it in the body.

## Proposed outcome

A spec that names a behaviour of another approved spec by id cannot be approved unless its
frontmatter links that behaviour. The refusal says the line to add.

## Affected users and systems

- `contentIssues()` in `.aidlc/lib/artifacts.mjs`, where approval already refuses scaffolds,
  and `test/gate-content.test.mjs`.
- `.aidlc/templates/spec.md`, whose reminder moves next to the frontmatter it refers to.
- `campaign-ledger` sprint 3, where the unattended agent approves its own spec and will now be
  refused until it records the link.

## Constraints

- Mechanical only. The gate matches an id that exists in another approved spec; it infers no
  contradiction from prose. `a-spec-can-be-superseded` argued why inference is wrong, and that
  argument stands.
- A spec may name an earlier behaviour without reversing it. Then it says so: `affirms:` is not a
  field, and inventing one is a guess. The refusal offers the link and, for the case where the
  reference is not a reversal, removing the id from prose or writing the behaviour's title
  instead. Observed once; if a real spec needs to cite without superseding, that is the next
  finding.
- No new skill, hook binding or verb. Law 11: one defect from the campaign, second instance.

## Open questions

- None that block the spec. Whether `affirms:` earns a place is answered by the next spec that
  cites without reversing, not by this one.
