# Review: init-delivers-skills-and-agents

- **Date:** 2026-08-24
- **Spec:** [../spec/init-delivers-skills-and-agents.md](../spec/init-delivers-skills-and-agents.md)
- **Plan:** [../plan/init-delivers-skills-and-agents.md](../plan/init-delivers-skills-and-agents.md)
- **Status:** changes-requested <!-- draft | approved | changes-requested  (HUMAN GATE 3) -->
- **Reviewer:** Claude Opus 5 — **the author of the change**. See "Independence" below.
- **Commit:** bc82def (5116767, 71381f0, 8281758 precede it)

`changes-requested`, not `approved`: gate 3 is a human gate, and the three conditions at the foot
of this file are unmet. Two of them cannot be met by an agent at all.

## Independence

This review was performed by the agent that wrote the diff. That is the writer/grader collapse
`.claude/agents/reviewer.contract.json` exists to prevent — *"a reviewer that can edit the diff it
reviewed has reviewed its own work"* — and it applies whether or not the reviewer holds a Write
tool, because the same context produced both the code and the judgment of it.

It was done this way because subagent dispatch was disabled for this session at the operator's
instruction. Before merge, this diff should be re-reviewed by the `reviewer` agent or a human.
Treat the findings below as the author's own audit, not as an independent one.

## Evidence

```
node .claude/bin/harness check --stage stop
PASS  secrets     41ms
PASS  test        9319ms

node .claude/bin/harness check --stage commit --all
PASS  secrets · PASS test · FAIL plan-drift · PASS budget
budget  skills=12/12  agents=3/3  hooks=5/5  hook_loc=137/600  claude_md_lines=62/120
```

133 tests, from 118 before the change. The suite ran zero tests before this work began, because
the `[capabilities].test` glob still pointed at the pre-move `.claude/test/`; that line was
repaired by the operator as part of `supporting-artefacts-to-root`, and the numbers above are the
first honest ones in this repository since the move.

`plan-drift` fails for a reason unrelated to this change and is analysed under Open findings.

## Findings

### Important — 1 (Bugs) · fixed in this change

`.claude/bin/harness` accepted `$HARNESS_HOME` without checking that it holds a harness, so a
mistyped CI variable produced a node module-loader stack trace instead of the two setup commands.
Behaviour 12 requires the commands "never fails silently and never falls back to a partial
harness"; exit status was correct, the message was not.

**Remedy applied:** the resolver now requires `bin/harness` under any candidate before accepting
it, falls through to the plugin cache when `HARNESS_HOME` is wrong, and names the bad variable in
the failure. Covered by an extension to *the shim fails loudly when the harness is nowhere*.

### Important — 2 (Compliance) · fixed in this change

`init` did not remove a `.claude/runtime/` left by an older harness. Behaviour 1 is written
against a fresh install, so the letter of the spec was met while its stated outcome — *"No copy of
the harness exists under the project's `.claude/`"* — was not, on the one path that matters for the
single project already installed. A stale runtime is the most dangerous form of the drift this
change exists to remove, because the project still looks correctly installed.

**Remedy applied:** `init` removes `.claude/runtime/` on every non-self run. Covered by
*upgrading removes a runtime left by an older harness*.

### Nits — 3 of 3, none blocking

1. `pluginIdentity()` falls back to version `0.0.0` in silence when `plugin.json` omits one. The
   cache lookup recovers by scanning the directory, so nothing breaks, but the record then names a
   version that was never published. Consider recording `unknown`, as `commit` already does.
2. `harnessRepository()` returns `null` when git is unavailable, and the CI recipe in
   `docs/OPERATING.md` interpolates the field without a guard — a null would become
   `git clone https://github.com/null`. Only reachable when the harness is not a checkout.
3. The `cp` branch of `bashTouchesProtected` inspects only the final argument, so
   `cp -r somedir .claude/` is not matched. Pre-existing — the previous implementation missed it
   too — and consistent with the spec's stated trade, but worth a comment naming the gap.

## Open findings — not fixed, and out of this spec's scope

1. **`plan-drift` assumes one change in flight.** `currentPlan()` selects the most recently
   modified *uncommitted* plan and grades the entire working tree against it. Four changes are open
   in this repository, so it graded this change against `empty-suite-is-not-a-pass.md`; this plan,
   being committed and clean, was excluded from the pool entirely. `--stage commit` cannot go green
   here until the others land. **Remedy:** rank plans that *name* the changed file above recency.
   Deserves its own intent.
2. **`ENVIRONMENT_SENSITIVE` misses missing tool plugins.** The bundled example's `test` verb needs
   `pytest-json-report`. When absent, the control reports `fail` rather than `errored`, so
   `envDiffers` stays false and `check_stop_tokens` is graded rather than skipped — the "a metric
   that depends on which tools are installed grades the laptop" rule fails on the one case it most
   needs to catch. The baseline was deliberately **not** re-captured; doing so would bake one
   laptop's gaps into the ratchet.
3. **The renamed manifests are unpushed.** `origin/main` still declares `lean-harness-local` /
   `lean-harness`, so the README's install commands resolve against the old marketplace until this
   work is pushed. Nothing in the offline suite can catch this.

## Behaviour coverage

| Behaviours | State |
|---|---|
| 1–8, 10–15, 18 | asserted offline, no API key, no network |
| 9 — README sequence on a clean machine | **unproven.** Rehearsal required before merge |
| 16 — cost job runs | half-proven: it executes, where it previously died on `Cannot find module`; it fails locally on `check_stop_tokens` for the toolchain reason in Open finding 2 |
| 17 — cold-clone CI | **unproven.** The recipe is documented and the same resolver is exercised through `HARNESS_HOME`, but no cold-clone run has happened |

## Conditions on approval

1. Re-review by the `reviewer` agent or a human, given the independence problem above.
2. Push, then rehearse behaviour 9 once on a machine with neither the marketplace nor the plugin
   installed, and record the result here.
3. One line remains for `.claude/CLAUDE.md`, which an agent may not edit mid-session: add the guard
   lesson to *Things this project gets wrong*.
