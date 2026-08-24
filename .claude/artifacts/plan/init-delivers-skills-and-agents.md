# Plan: init-delivers-skills-and-agents

- **Date:** 2026-08-24
- **Spec:** [.claude/artifacts/spec/init-delivers-skills-and-agents.md](../spec/init-delivers-skills-and-agents.md)
- **Risk tier:** standard <!-- low | standard | critical -->
- **Status:** approved <!-- draft | approved  (HUMAN GATE 2) -->

Standard rather than low: the change deletes the mechanism by which every installed project
currently obtains the sensors, and rewrites the one executable every hook and every CI job calls.
A mistake does not corrupt data — it silently removes enforcement, which is the failure mode this
whole change exists to end. The seam test lands first for that reason.

Not critical: no authentication, no payments, no migration, no data deletion, and every step is
reversible by `git revert` plus one re-run of `init`.

## Decision taken on the spec's first policy concern

Carried unanswered through two gates, so it is decided here and flagged for veto.

**This repository keeps its own `.claude/` wiring and explicitly disables the published plugin
within itself.** Its settings gain `"lean_harness_cs_v1@lean_harness_cs_v1": false`, a shape
already in use on this machine for `harness-eng-v2`. The repository stays self-governing — it runs
its own hooks, from its own tree, so an edit to a sensor takes effect on the next turn instead of
after a plugin reinstall — and a maintainer who also has the plugin installed no longer loads the
harness twice.

The alternative considered and rejected: moving the plugin root out of `.claude/` to a sibling
directory. That is the structurally cleaner answer, and it would dissolve the collision instead of
suppressing it, but it contradicts the principle just approved in `supporting-artefacts-to-root`
— that `.claude/` holds the surface Claude Code discovers by convention — and it is a far larger
diff than this spec's behaviours justify. If the collision resurfaces, that is the next move.

## Files

Every path this change touches. `harness check --stage commit` compares the diff against this
list — if they disagree, update this block in the same commit or revert the change.

```
.claude/bin/harness
.claude/checks/budget.mjs
.claude/lib/guard.mjs
.claude/hooks/dispatch.mjs
.claude/settings.json
.claude/CLAUDE.md
.claude/templates/CLAUDE.md
.claude/.claude-plugin/plugin.json
.claude-plugin/marketplace.json
test/install.test.mjs
test/budget.test.mjs
test/guard.test.mjs
.github/workflows/harness.yml
examples/scratch-py/.claude/settings.json
examples/scratch-py/.claude/harness-install.json
examples/scratch-ts/.claude/settings.json
examples/scratch-ts/.claude/harness-install.json
README.md
docs/OPERATING.md
docs/BUILD-PLAN.md
```

## Order of work

Ordered so the defect is reproducible in the suite before anything is repaired, and so the
install path is demonstrably working before the documentation describing it is rewritten.

1. **`test/install.test.mjs` — new, and red on arrival.** Install into a fresh temporary git
   repository and assert the spec's structural behaviours. This is the seam that had no coverage
   and is the reason every defect in the spec survived 118 passing tests. It must fail now.
2. **Rename the plugin and the marketplace.** `.claude-plugin/marketplace.json` and
   `.claude/.claude-plugin/plugin.json` both become `lean_harness_cs_v1`; the marketplace source
   becomes the repository's real remote rather than a laptop path. The plugin identifier is
   therefore `lean_harness_cs_v1@lean_harness_cs_v1`. Behaviour 6 is asserted against the two
   manifests, so a future rename that touches only one of them fails the suite.
3. **Rewrite `init` in `.claude/bin/harness`.** Delete the `runtime` copy loop and the generated
   hook block. `settings.json` becomes `enabledPlugins` plus the existing `permissions`. The
   install record gains `marketplace`, `plugin`, `version` and `commit`, keeping `shipped`
   unchanged so the budget continues to read it. `commit` comes from `git rev-parse HEAD` in the
   harness checkout, and is the string `unknown` when the harness is not a checkout — never
   absent, or the budget's own "no confident zero" rule is violated by its neighbour.
4. **Rewrite the generated shim.** A bash shim that resolves the harness in three steps and execs
   it: `$HARNESS_HOME` first, so CI can point at its clone; then the plugin cache, located by
   reading the install record; then failure. The resolver is inline because it cannot import from
   the harness it is trying to find. On failure it exits non-zero naming both setup commands
   (behaviour 12) — it must never degrade to a partial harness.
5. **Narrow the guard, in `.claude/lib/guard.mjs`.** `bashTouchesProtected` currently tests one
   `writeish` regex against the whole command string, so the `>` in `2>&1` counts as a write. It
   fired four times against read-only commands during this change alone. Detect redirection
   targets rather than the presence of `>`, and ignore file-descriptor redirections. Add the
   regression case for a genuine write in the same commit — this function has no test today,
   which is why the defect was free to exist.
6. **Repoint this repository's own `.claude/settings.json`.** It currently hardcodes the author's
   home directory into all five hook commands, so the harness's own hooks are inert for every
   other clone and in CI. Replace with `${CLAUDE_PROJECT_DIR}` and add the plugin-disable entry
   from the decision above.
7. **Rework `test/budget.test.mjs`.** Its `budgetOf` helper invokes
   `.claude/runtime/bin/harness`, which step 3 deletes. Repoint it at the generated shim with
   `HARNESS_HOME` set, which is also how CI will call it. The assertions on recorded counts stay:
   under plugin delivery the record is load-bearing, not vestigial.
8. **Make the examples real installs and fix the cost job.** `examples/scratch-py` and
   `examples/scratch-ts` have `harness.toml` and `CLAUDE.md` but no settings and no record, so
   `.github/workflows/harness.yml`'s cost job cannot run there — `Cannot find module`. Give each a
   generated settings file and install record, and set `HARNESS_HOME` in the job. This is the only
   CI exercise of an installed layout and it has been unable to run.
9. **Documentation last, once the path it describes works.** `README.md`: the clone URL currently
   names a repository that does not exist, and the setup section still describes `runtime/` and a
   copied harness. Rewrite steps 1–6 as the two one-time machine commands plus `init`.
   `.claude/templates/CLAUDE.md` and `.claude/CLAUDE.md`: correct the `bash` versus `node`
   invocation so the printed command is the one that runs, and add the guard lesson to "Things
   this project gets wrong" — it has now happened four times. `docs/OPERATING.md` gains the CI
   bootstrap snippet; `docs/BUILD-PLAN.md`'s layout tree loses `runtime/`.

## Proof

Each numbered spec behaviour and the test that demonstrates it. Behaviours 9, 10 and 17 cannot be
proved by an offline suite; their proof is named honestly rather than claimed.

| Spec behaviour | Proof |
|---|---|
| 1 — no harness copy in the project | `test/install.test.mjs`: after `init`, none of `runtime lib checks hooks skills agents` exists under the installed `.claude/` |
| 2 — settings enable one plugin, declare no hooks | `test/install.test.mjs`: parsed settings have exactly one true entry in `enabledPlugins` and no `hooks` key |
| 3 — no machine-specific path | `test/install.test.mjs`: no file written under the installed `.claude/` contains the temporary root's absolute path. Also applied to this repository's committed settings by the same assertion over `.claude/settings.json` |
| 4 — record names marketplace, plugin, commit | `test/install.test.mjs`: all four fields present; `commit` is a 40-character hex string or the literal `unknown` |
| 5 — re-running `init` is idempotent | `test/install.test.mjs`: `harness.toml` and project `CLAUDE.md` are byte-identical across two runs; the record is the only file whose mtime may change |
| 6 — identifier resolves against the manifests | `test/install.test.mjs`: the id written into settings equals `<plugin>@<marketplace>` read from `.claude/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` |
| 7 — marketplace source is the real remote | `test/install.test.mjs`: the source is a git or github source, is not a `directory` source, and its repository matches `git remote get-url origin` |
| 8 — README names only things that exist | `test/install.test.mjs`: every marketplace, plugin and repository identifier appearing in `README.md` is one of the two manifests' names or the real remote |
| 9 — README sequence works end to end | **Not provable offline.** Proof is the manual rehearsal already run during the intent, repeated once on a clean machine before merge, and recorded in the review artifact |
| 10 — this repository loads once | **Not provable offline.** `test/install.test.mjs` asserts the disable entry is present in `.claude/settings.json`; that it produces single loading was observed manually during the intent and is re-checked at review |
| 11 — shim works from cache and from clone | `test/install.test.mjs`: the shim exits 0 with `HARNESS_HOME` set, and exits 0 against a fake plugin-cache tree built in the temporary directory |
| 12 — shim fails loudly when it cannot resolve | `test/install.test.mjs`: with `HARNESS_HOME` unset and no cache, exit status is non-zero and stderr names both setup commands |
| 13 — printed command runs here | `test/install.test.mjs`: the command string in the SessionStart banner and in `.claude/CLAUDE.md` is executed in this repository and exits 0 |
| 14 — reads are never denied | `test/guard.test.mjs`: `head -n 5 .claude/settings.json 2>/dev/null`, `cat .claude/templates/CLAUDE.md 2>&1` and `cp ~/.claude/settings.json /tmp/x` are each allowed |
| 15 — writes are still denied | `test/guard.test.mjs`: `echo x > .claude/settings.json`, `sed -i '' s/a/b/ .claude/harness.toml` and `tee .claude/CLAUDE.md` are each denied with the existing message |
| 16 — cost job runs | `.github/workflows/harness.yml` cost job exits 0 in CI; locally, `baseline check` in `examples/scratch-py` exits 0 |
| 17 — installed project runs `commit` in CI cold | **Not provable by the unit suite.** Proof is the cost job in step 8, which exercises the same resolver via `HARNESS_HOME`, plus the documented snippet in `docs/OPERATING.md` |
| 18 — the seam has coverage | `test/install.test.mjs` exists, runs under `node --test test/*.test.mjs`, makes no network call and reads no API key |

## Rollback

`git revert` the commit, then re-run `init` in any project that installed the new shape. Projects
on the old shape are unaffected until they re-run `init`, because nothing removes an existing
`runtime/` directory — it simply stops being written. The one known install,
`../claude_harness_lean_v1_test`, is re-initialised by hand and is not a migration concern.
