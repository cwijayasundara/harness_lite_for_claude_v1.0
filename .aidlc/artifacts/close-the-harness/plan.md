---
status: approved
by: cwijayasundara
at: 2026-09-06T15:26:06.412Z
digest: sha256:237e9a88f11a2dda2561f1d1543e7eaa3f13d1f0010c290bcb7f043f6eef5a4d
---
# Plan: close-the-harness

## Approach

Three gates, three prompts, two runs, one deletion.

**B1, B2.** One entry in `dispatch.mjs`'s `DESTRUCTIVE` table beside `init-force`, with the same
anchoring: `(^|[|;&]\s*)(node\s+|bash\s+|sh\s+)?\S*harness\s+approve\b`, rule
`approve-is-the-humans`, and a guard clause so the table entry is skipped when
`process.env.AIDLC_UNATTENDED` is set. The message: approval is the human's gate; ask them to run
it. Tested through the hook the way `init --force` is.

**B3.** `config.mjs` merges `['.aidlc/harness.toml']` into `guard.protected_paths` ahead of
whatever the registry lists. `writeBlocked` already refuses a protected path no plan names and
yields to one a plan names.

**B4.** In `contentIssues()` for `kind === 'spec'`: if the committed text at `HEAD` parses to
`status: approved`, compare `behavioursOf` of the committed body with the working body; any id
present only in the working body is refused, naming it. Read with `git show HEAD:<rel>`, the
dependency `isCommitted` already carries; if git cannot answer, the check stays silent.

**B5.** Three prompt strings gain the closing sentence.

**B6.** The runs, the record, the deletion, in that order, in the evidence.

Rejected: putting F37 in the write guard. Approval is a command, not a file write; the pre-bash
hook is the only place that sees it, and it sees only the agent's commands.

Rejected: refusing every edit to an approved spec at B4. Prose fixes are ordinary and the
digest already reports them; only growth of the promise set is the reversal route.

## Files

- `.aidlc/hooks/dispatch.mjs`
- `.aidlc/lib/config.mjs`
- `.aidlc/lib/artifacts.mjs`
- `.aidlc/templates/harness.toml`
- `evals/tasks.json`
- `evals/expected.json`
- `test/guard.test.mjs`
- `test/supersedes.test.mjs`
- `test/unit.test.mjs`
- `docs/OPERATING.md`
- `docs/PROGRAM.md`
- `.aidlc/artifacts/close-the-harness/`

## Order

1. `test/guard.test.mjs` — B1, B2: through the dispatch `pre-bash` action, `node
   .aidlc/bin/harness approve x spec --by me` is denied with rule `approve-is-the-humans` and
   the human named; a heredoc quoting the words is allowed; with `AIDLC_UNATTENDED=1` in the
   environment it is allowed. Red, then `.aidlc/hooks/dispatch.mjs` green.
2. `test/guard.test.mjs` — B3: `loadConfig` on a registry with no `protected_paths` yields
   `.aidlc/harness.toml` protected; `writeBlocked('.aidlc/harness.toml')` is refused with no
   plan and allowed with a committed approved plan naming it. Red, then `.aidlc/lib/config.mjs`
   green, and `.aidlc/templates/harness.toml`'s comment says so.
3. `test/supersedes.test.mjs` — B4 through the CLI: approve a spec with B1; add `### B2` and
   re-approve, refused naming B2; reword B1's prose and re-approve, accepted. Red, then
   `.aidlc/lib/artifacts.mjs` green.
4. `evals/tasks.json` — B5; `test/unit.test.mjs` asserts the three prompts end with the
   sentence.
5. `docs/OPERATING.md` — one sentence each for B1, B3, B4.
6. `node evals/run.mjs --id campaign-ledger --require-auth`, then
   `node evals/run.mjs --require-auth`, then `harness evals gate --update`; results into
   `evidence.md`; `git rm docs/PROGRAM.md` (B6).

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/guard.test.mjs` — an agent's `harness approve` is denied with rule `approve-is-the-humans`; a quoted mention is not |
| B2 | `test/guard.test.mjs` — the same command with `AIDLC_UNATTENDED=1` is allowed |
| B3 | `test/guard.test.mjs` — the registry is protected by default and a plan naming it still permits the write |
| B4 | `test/supersedes.test.mjs` — added behaviour headings are refused at re-approval; a prose edit is accepted |
| B5 | `test/unit.test.mjs` — the three prompts carry the no-questions sentence |
| B6 | `.aidlc/artifacts/close-the-harness/evidence.md` — both runs recorded, `expected.json` re-recorded, `docs/PROGRAM.md` gone |
