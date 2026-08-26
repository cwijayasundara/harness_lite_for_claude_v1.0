# Plan: supporting-artefacts-to-root

- **Date:** 2026-08-24
- **Spec:** none — relocation only, no behaviour change. Nothing to specify: no product
  behaviour, no runtime path, and no control changes meaning. The chain starts at plan for the
  same reason `docs-to-repo-root` did.
- **Risk tier:** standard <!-- low | standard | critical -->
- **Status:** approved

Standard, not low, for one reason: `[guard].protected_paths` names the eval fixtures. If that
line is not repointed in the same commit, the fixtures silently become writable, and a
write-protected fixture that is no longer write-protected is the exact failure this repo warns
about — "a fixture edited to make a test pass is a fixture that no longer tests."

## The principle being applied

`.claude/` is the harness. Things that *exercise* the harness are not the harness. After this
change `.claude/` holds only: the installable runtime (`bin` `lib` `checks` `hooks`
`templates`), the surface Claude Code discovers by convention (`skills` `agents` `CLAUDE.md`
`settings.json`), the artefact chain (`artifacts`), harness-written state (`state`), and the
one hand-edited registry (`harness.toml`). Everything that tests, benchmarks, or demonstrates
the harness sits beside it at the repo root.

This is a stronger rule than "`init` does not copy it" — that test is necessary but not
sufficient, since it would also evict `skills/` and `agents/`, which Claude Code must find
under `.claude/`.

## Files

Every path this change touches. `harness check --stage commit` compares the diff against this
list — if they disagree, update this block in the same commit or revert the change.

```
test/
evals/
examples/
.claude/test/
.claude/evals/
.claude/examples/
.claude/harness.toml
.claude/lib/paths.mjs
.gitignore
.github/workflows/harness.yml
README.md
docs/OPERATING.md
docs/BUILD-PLAN.md
```

## Order of work

Ordered so the suite is runnable again as early as possible: the move and the anchor repair
land together, because between them nothing passes.

1. `git mv .claude/test test`, `git mv .claude/evals evals`, `git mv .claude/examples examples`.
2. Add `test/_paths.mjs` exporting `C` (the plugin root) and `ROOT` (the repo root). Twelve test
   files currently derive the plugin root with
   `path.dirname(path.dirname(fileURLToPath(import.meta.url)))`, which after the move resolves
   to the repo root instead. Repointing each one inline would hardcode the string `.claude`
   into twelve files; today not one of them knows what the directory is called. One helper
   keeps that knowledge in a single place.
3. Repoint the 11 test files with `../lib/*`, `../checks/*`, `../evals/*` imports. `../evals/*`
   becomes `../evals/*` still — both moved to root, so those are unchanged; only `../lib/` and
   `../checks/` gain `.claude/`.
4. Repoint `evals/bench/pack-bench.mjs` and the other `../../lib/*` importers under `evals/`.
5. `.claude/harness.toml`: `[checks].test` glob, `[guard].protected_paths`, `[monitoring].collect`.
6. `.github/workflows/harness.yml`: the test run, the bench run, the `scratch-py`
   working-directory, the auth'd-eval path filter, and the eval run.
7. `README.md` "Develop and verify" block and the two example links.
8. `docs/OPERATING.md` — two `.claude/evals/` references.
9. `docs/BUILD-PLAN.md` — the repository-layout tree, which still shows all three inside
   `.claude/`, and the divergence row that now reads on a wider claim than docs alone.
10. `evals/run.mjs` — keep writing results to `.claude/evals/results/`. The suite moved; its
    results did not. `indicators.mjs:69` reads `cfg.layout.claude + '/evals/results'` and
    `lifecycle-cli.test.mjs:99` asserts a target repo keeps its own there, so following the
    suite to the root would silently blank `eval_pass_rate` on `harness status`. Results are
    harness output *about* a repo, not part of the eval suite. `.gitignore:5` already names
    `.claude/evals/results/`, which is corroboration rather than coincidence.
11. `.claude/lib/paths.mjs` — narrow the opening comment to what `layout()` actually returns,
    and say where the suite, evals and examples now live.
12. `.claude/lib/graph.mjs` and `.claude/lib/pack.mjs` — no change needed. Their comments name
    `test/graph.test.mjs` and `evals/bench/pack-bench.mjs` with no `.claude/` prefix, which the
    move makes literally true.
13. Leave `.claude/artifacts/**` untouched. Committed plans name paths as they were when those
    changes landed; rewriting them to match today's tree falsifies the audit trail.

## Proof

No spec, so no numbered behaviours. The claim is that nothing regressed and no reference
dangles — each row is a way that claim could be false, and the check that catches it.

| Claim | Proof |
|---|---|
| The suite still runs and passes from its new location | `harness check --stage stop` — `PASS secrets`, `PASS test`, 15 files |
| No test silently tests nothing after re-anchoring | A wrong `C` inside a test hits `readdirSync` on a missing directory and throws. **This does not hold one level up**: the `[checks].test` glob in `harness.toml` is expanded by a shell, so a glob matching zero files exits 0 and `--stage stop` prints `PASS test` in 33ms instead of ~10s. Observed during this change. The proof is therefore the *count* — 107 tests, not a green tick |
| Eval fixtures are still write-protected | `guard.test.mjs` — the protected-path assertion must still fail a write under `evals/fixtures` |
| `plan-drift` sees the move as planned | `harness check --stage commit` — `PASS plan-drift` against this file list |
| Budget is unaffected | `checks/budget.mjs` counts skills, agents, hooks, `CLAUDE.md` lines — none move |
| `init` still installs a working harness | `lifecycle-cli.test.mjs`; `bin/harness:84` copies `bin checks hooks lib templates`, none of which move |
| CI is repointed, not just locally green | `playbook-pack.test.mjs` reads `.github/workflows/`; the harness.yml paths are exercised on push |
| No dangling reference remains | `grep -rn "\.claude/\(test\|evals\|examples\)"` over README, docs, skills, agents, lib, bin, test, workflows, harness.toml — hits only under `.claude/artifacts/` |

## Risks

| Risk | Mitigation |
|---|---|
| `protected_paths` missed → fixtures become writable | Called out as the reason for the standard tier; `guard.test.mjs` is named in Proof and must be seen to pass, not assumed |
| A test re-anchors to the repo root and passes vacuously | `readdirSync` on a missing directory throws; confirmed no path-conditional skips exist in the suite |
| The auth'd-eval filter in `harness.yml:48` still matches `^\.claude/evals/...` | It would stop triggering silently — nothing fails, the job just never runs. Repointed in step 6 and re-read after |
| `examples/scratch-{py,ts}/.claude/` now sits two levels below the repo root | Unchanged in kind — they were already nested inside a parent `.claude/`. `findRepoRoot` walks upward and still stops at the first `.claude` or `.git`, so a harness invoked inside an example still resolves to that example |
| `evals/results/` follows the suite to the root and `harness status` stops finding it | Caught during the change: producer (`run.mjs`) and consumer (`indicators.mjs`) came apart. Resolved in step 10 by keeping results under `.claude/`. This reverses the recommendation made when the plan was first drafted — the code, not preference, settles it |
| Churn lands on top of an unapproved `docs-to-repo-root` plan | That plan is still `draft` in git. Approving both at gate 2 together keeps the chain honest |
| `harness.toml` cannot be edited by an agent mid-session | It is in `PREFIX_CACHE_PATHS`; the guard says to ask the human to change it between sessions. The three lines are handed over rather than worked around |
| A zero-match test glob passes silently | Found live during this change (see Proof). Worth a follow-up control — `check` should fail when its test command matches no files — but that is a new control with a `why:`, not part of a relocation |
