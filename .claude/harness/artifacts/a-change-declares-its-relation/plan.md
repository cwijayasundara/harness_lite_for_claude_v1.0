---
status: approved
by: cwijayasundara
at: 2026-09-06T07:41:04.441Z
digest: sha256:aad5bc68605f544cc638d012b9843119deaaa1e72c03dcac111c2e53cbdcaea1
---
# Plan: a-change-declares-its-relation

## Approach

In `contentIssues()` for `kind === 'spec'`: collect the other open changes with an approved spec
(`slugs()`, skip closed, skip self, `read(...,'spec').state === 'approved'`); collect the slugs
this spec relates to — every `supersedes:` link's slug plus every `extends:` entry; refuse for
each open change not in that set, in one message listing them with the two lines. `extends:` is
parsed the same way `supersedesLinks` parses its field (comma-separated), exported as
`extendsLinks(front)`, and each entry validated like a link's slug. The template gains one
frontmatter comment line; the skill gains one sentence.

Rejected: requiring the relation at plan approval instead. The spec is where behaviours are
claimed, and the earlier gate is the one that should ask.

Rejected: inferring `extends:` when nothing is declared. Silence is the defect.

## Files

- `.aidlc/lib/artifacts.mjs`
- `.aidlc/templates/spec.md`
- `.aidlc/skills/spec/SKILL.md`
- `test/supersedes.test.mjs`
- `docs/OPERATING.md`
- `.aidlc/artifacts/a-change-declares-its-relation/`

## Order

1. `test/supersedes.test.mjs` — B1–B4 through the CLI: with `ledger` approved and open, a new
   spec with neither field is refused listing `ledger` and both lines; with
   `extends: ledger` it is approved; with `supersedes: ledger#B2` it is approved; with
   `extends: nowhere` it is refused naming `nowhere`; with `ledger` closed, neither field is
   required. Red.
2. `.aidlc/lib/artifacts.mjs` — `extendsLinks(front)` and the check. Green.
3. `.aidlc/templates/spec.md` and `.aidlc/skills/spec/SKILL.md` — B5.
4. `docs/OPERATING.md` — one sentence in the supersession paragraph.
5. `node evals/run.mjs --id campaign-ledger --require-auth` (B6); record as run 5 in
   `.aidlc/artifacts/one-integration-test/evidence.md`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/supersedes.test.mjs` — a spec beside an open approved change is refused without a relation, listing the change and both lines |
| B2 | `test/supersedes.test.mjs` — `extends: nowhere` is refused naming it |
| B3 | `test/supersedes.test.mjs` — the existing approval tests, which approve a lone spec, pass unchanged |
| B4 | `test/supersedes.test.mjs` — a closed approved change requires nothing |
| B5 | `test/gate-content.test.mjs` — the template frontmatter names `extends:`; the skill file contains the sentence (asserted by `grep` in the same test) |
| B6 | the `campaign-ledger` run recorded in `.aidlc/artifacts/one-integration-test/evidence.md` run 5 |
