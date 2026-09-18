---
status: approved
by: cwijayasundara
at: 2026-09-06T06:52:57.120Z
digest: sha256:e907f86da0f0d86843836508d8558e5c673b72e0f0c6cff3bb617ffc70045021
---
# Spec: a-named-behaviour-is-a-link

## Outcome

When an agent has named the behaviour it is reversing, the link is recorded where the harness
reads it, because approval refuses the spec until it is.

## Observable behaviours

### B1 — a named id must be linked

Given a `spec.md` being approved whose body contains `<slug>#B<n>` where `<slug>` is another
change with an approved spec that has a `### B<n>` heading,
When `harness approve <slug> spec` runs,
Then it is refused unless the frontmatter's `supersedes:` names that same `<slug>#B<n>`. The
refusal quotes the id, says to add `supersedes: <slug>#B<n>` to the frontmatter, and says that if
the reference is not a reversal the id should be removed from the prose.

### B2 — a linked id passes

Given the same spec with `supersedes: <slug>#B<n>` in its frontmatter,
When it is approved,
Then the existing `a-spec-can-be-superseded` checks run and nothing new is refused.

### B3 — an id that points at nothing is not this rule's business

Given a body that names `<slug>#B<n>` where the slug has no approved spec or no such heading,
When the spec is approved,
Then this rule stays silent. A typo pointing at nothing is `no-name-points-at-nothing`'s and the
`supersedes:` validation's concern, and only when it is declared.

### B4 — the reminder sits beside the field

Given `.aidlc/templates/spec.md`,
When `harness new` writes a spec,
Then the sentence about `supersedes:` appears in the frontmatter block itself, as a comment
line the parser ignores, rather than as the last paragraph of the body.

### B5 — the campaign proves it

Given `campaign-ledger` sprint 3 under the unattended runner,
When the agent writes the contradiction's id into its spec and approves it,
Then approval is refused until `supersedes:` carries the link, and the run's existing
`file_matches` on `supersedes:` passes.

## Out of scope

- Inferring a contradiction from prose that names no id.
- An `affirms:` or `cites:` field. Not observed yet.
- Plans and intents. Only the spec carries `supersedes:`.

## Safeguards

- The match is on the exact `<slug>#B<n>` shape and only against approved specs that have the
  heading, so ordinary prose cannot trip it.
- `test/gate-content.test.mjs` and `test/supersedes.test.mjs` pass unchanged.
- The frontmatter comment in B4 must parse to nothing: `parse()` in `artifacts.mjs` is tested on
  the new template.
