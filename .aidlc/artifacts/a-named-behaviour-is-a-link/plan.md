---
status: draft
---
# Plan: a-named-behaviour-is-a-link

## Approach

One more check in `contentIssues()` for `kind === 'spec'`: scan the body for
`\b([a-z0-9][a-z0-9-]*)#(B\d+)\b`, keep the matches whose slug has an approved spec containing
that heading (the same lookup `supersedes:` validation already does), subtract the ids in
`supersedesLinks(front)`, and refuse naming what is left. `approve()` already runs
`contentIssues` after the ordering and committed checks, so the message lands in the same place
the scaffold refusal does.

The template moves its reminder into the frontmatter as `# supersedes: <slug>#B<n> — when this
reverses an approved behaviour` — a comment line. `parse()` must ignore it: tested.

Rejected: matching the word "supersede" in prose. Words are what F9 was about.

Rejected: auto-writing the link from the prose. The gate refuses and says the line; a human or
the unattended agent writes it, so the record is something someone chose.

## Files

- `.aidlc/lib/artifacts.mjs`
- `.aidlc/templates/spec.md`
- `.aidlc/skills/spec/SKILL.md`
- `test/gate-content.test.mjs`
- `test/supersedes.test.mjs`
- `docs/OPERATING.md`
- `.aidlc/artifacts/a-named-behaviour-is-a-link/`

## Order

1. `test/supersedes.test.mjs` — B1, B2, B3 through the CLI: a spec naming `ledger#B2` in prose
   with `ledger` approved is refused with the line to add; the same spec with
   `supersedes: ledger#B2` is approved; a spec naming `nowhere#B9` is not refused by this rule.
   Red.
2. `.aidlc/lib/artifacts.mjs` — the check in `contentIssues`. Green.
3. `test/gate-content.test.mjs` — B4: the template's frontmatter parses to `{ status: 'draft' }`
   and its body no longer contains the reminder paragraph. Red, then `.aidlc/templates/spec.md`.
4. `.aidlc/skills/spec/SKILL.md` — the one sentence about the field says the gate will refuse a
   named id that is not linked.
5. `docs/OPERATING.md` — one sentence in the supersession paragraph.
6. `node evals/run.mjs --id campaign-ledger --require-auth` (B5); record as run 3 in
   `.aidlc/artifacts/one-integration-test/evidence.md`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/supersedes.test.mjs` — a prose-named approved behaviour id without a link is refused at approval, quoting the line to add |
| B2 | `test/supersedes.test.mjs` — the same spec with the link is approved |
| B3 | `test/supersedes.test.mjs` — an id naming no approved behaviour is not refused by this rule |
| B4 | `test/gate-content.test.mjs` — the template's frontmatter comment parses to nothing and the body has no reminder paragraph |
| B5 | the `campaign-ledger` run recorded in `.aidlc/artifacts/one-integration-test/evidence.md` run 3: sprint 3's `supersedes:` assertion passes |
