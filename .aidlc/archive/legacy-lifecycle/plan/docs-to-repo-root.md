# Plan: docs-to-repo-root

- **Date:** 2026-08-24
- **Spec:** none — documentation relocation, no behaviour change. The chain starts at plan
  because there is nothing to specify: no product code, no test, no runtime path is touched.
- **Risk tier:** low
- **Status:** approved

## Files

```
docs/BUILD-PLAN.md
docs/CONSTITUTION.md
docs/OPERATING.md
docs/analysis.html
docs/handbook.html
README.md
.gitignore
```

## Order of work

1. `git mv .claude/docs docs` — the four tracked docs plus the new `handbook.html`.
2. Repoint the three README links from `.claude/docs/*` to `docs/*`.
3. Update the repository-layout tree in `docs/BUILD-PLAN.md`: `docs/` now sits beside
   `.claude/`, not inside it.
4. Amend the "repo-root `docs/`" divergence row in `docs/BUILD-PLAN.md` and the matching row in
   `docs/handbook.html`. The divergence was always about **artefacts**; those stay under
   `.claude/artifacts/`. Prose about the harness was never part of the installable surface.
5. Add `.DS_Store` to `.gitignore` — `--stage commit` surfaced an untracked Finder file that
   the ignore list never covered. Unrelated to the move, one line, and it blocks the same gate.
6. Leave `.claude/artifacts/plan/*.md` untouched. Those name `.claude/docs/OPERATING.md` as it
   was when the change landed; rewriting a committed plan to match today's tree falsifies the
   audit trail the chain exists to keep.

## Proof

No behaviour changes, so the proof is that nothing regressed and no reference dangles.

| Claim | Proof |
|---|---|
| Nothing in the runtime resolved `.claude/docs` | `grep -rn "docs" .claude/lib .claude/checks .claude/bin` — no hits |
| `init` never shipped docs to a target repo | `bin/harness` copies `bin, checks, hooks, lib, templates` only |
| Budget is unaffected | `checks/budget.mjs` counts skills, agents, hooks, `CLAUDE.md` — not docs |
| The suite still passes | `harness check --stage stop` — `PASS secrets`, `PASS test` |
| No dangling link remains | `grep -rn "claude/docs"` over README, docs, skills, agents, lib, bin, test, workflows — no hits |

## Risks

| Risk | Mitigation |
|---|---|
| A future reader takes root `docs/` as the artefact directory | The divergence row now says explicitly where artefacts live and why `docs/` is not there |
| An external link to `.claude/docs/*` breaks | Only the README pointed there; GitHub renders the moved paths from the same commit |
| `docs/` collides with a target project's own `docs/` | It cannot — `init` copies only `.claude/`; the evals fixture's `docs/req-b.md` is a target-repo file and is unrelated |
