---
status: draft
---
# Plan: a-plan-proves-its-spec

## Approach

Both behaviours are one comparison made at one moment: while approving an artifact, read what it
says. `approve()` already has every precondition about an artifact's *state* — committed,
plan-after-spec, digest — and the two new checks sit beside them, after those, so an existing
message wins when both apply.

`templateMarkers()` reads `.aidlc/templates/spec.md` and `plan.md` and extracts the angle-bracket
placeholders the scaffold ships. Read, never hard-coded: `harness new` writes those files, so the
harness recognises its own output instead of guessing at prose, and a template edited later cannot
drift away from the checker. Review `1ace6a8` Nit 2 caught two hand-copied strings diverging inside
a single week; this is the same mistake declined in advance. B1 fails an approval when a marker
survives, or when a `### B<n>` body is still the bare `Given ... When ... Then ...`.

`behavioursOf(specText)` and `proofRowsOf(planText)` are the same two parsers
`evals/lib/campaign.mjs` already has, moved into `.aidlc/lib/artifacts.mjs` where `approve()` can
reach them, with `campaign.mjs` importing them rather than keeping a second copy. B2 fails an
approval when a spec behaviour has no row. Presence only — F11 and F15 record that every plan an
agent has written proves behaviours with prose, and a plan legitimately names a test it has not
written yet: `a-spec-can-be-superseded`'s plan names `test/supersedes.test.mjs` today and the file
will not exist until that change is built. A gate demanding a resolvable test would refuse every
plan at the moment plans are meant to be approved.

The override is `--anyway <reason>`, recorded into the approval frontmatter as
`approved_anyway: <reason>`. B4 wants a way through that leaves a record, and frontmatter is where
this artifact's other decisions already live. A flag with no reason is refused; the reason is the
point.

Rejected: a `--stage commit` check instead of a gate. The claim is about what is being approved, and
the moment it becomes true is the approval. A commit check reports it after the decision, to
whoever runs CI rather than whoever decided.

Rejected: refusing on any prose resembling a template. F13 is the standing warning — an assertion
that graded British spelling failed a step whose behaviour was satisfied. Only the markers the
harness itself wrote are safe to match.

Rejected: retrofitting the twenty-three migrated changes. B6 says already-approved stays approved,
and F16 is the change that decides what happens to them.

## Files

- `.aidlc/lib/artifacts.mjs`
- `.aidlc/bin/harness`
- `evals/lib/campaign.mjs`
- `test/gate-content.test.mjs`
- `.aidlc/artifacts/a-plan-proves-its-spec/`
- `docs/OPERATING.md`

## Order

1. `test/gate-content.test.mjs` — B1: approving an unedited `spec.md` and an unedited `plan.md` is
   refused, each naming the placeholder found. Red first: `approve()` reads no content today. Use
   the real templates via `harness new`, not a hand-written imitation.
2. `.aidlc/lib/artifacts.mjs` — `templateMarkers()`, and the B1 refusal inside `approve()` after the
   existing preconditions.
3. `test/gate-content.test.mjs` — B2: a plan whose spec claims `B1`..`B4` and whose Proof table names
   `B1` and `B3` is refused naming `B2` and `B4`; a plan naming a test file that does not exist yet
   is *approved*, because presence is the bar.
4. `.aidlc/lib/artifacts.mjs` — move `behavioursOf` and `proofRowsOf` in, add the B2 refusal;
   `evals/lib/campaign.mjs` imports them instead of keeping its own.
5. `test/gate-content.test.mjs` — B3: each refusal names the file, what is missing, and the fix.
6. `test/gate-content.test.mjs` — B4: `--anyway <reason>` proceeds and records
   `approved_anyway:` in frontmatter; `--anyway` with no reason is refused.
7. `.aidlc/bin/harness` — the `--anyway` flag on `approve`, and the refusal text.
8. B5: run the check across every reachable artifact, record the result in
   `.aidlc/artifacts/a-plan-proves-its-spec/`, and edit nothing to make it pass.
9. B6: a test that an artifact approved before this change still reads `approved`.
10. `docs/OPERATING.md` — one paragraph: the two refusals, the override, and that neither applies
    retroactively.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/gate-content.test.mjs` — an unedited `spec.md` and an unedited `plan.md` from the real templates are each refused, naming the placeholder |
| B2 | `test/gate-content.test.mjs` — a plan missing rows for `B2` and `B4` is refused naming both; a plan naming a not-yet-written test file is approved |
| B3 | `test/gate-content.test.mjs` — each refusal names the file, the omission and the fix |
| B4 | `test/gate-content.test.mjs` — `--anyway <reason>` records `approved_anyway:`; `--anyway` without a reason is refused |
| B5 | the corpus run recorded in `.aidlc/artifacts/a-plan-proves-its-spec/`, with no artifact edited to pass |
| B6 | `test/gate-content.test.mjs` — an artifact approved before the change still reads `approved` |
