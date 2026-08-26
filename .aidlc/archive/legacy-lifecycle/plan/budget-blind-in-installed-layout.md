# Plan: budget-blind-in-installed-layout

- **Date:** 2026-08-24
- **Spec:** [.claude/artifacts/spec/budget-blind-in-installed-layout.md](../spec/budget-blind-in-installed-layout.md)
- **Risk tier:** standard <!-- low | standard | critical -->
- **Status:** approved <!-- draft | approved  (HUMAN GATE 2) -->

## Mechanism

The check currently anchors every surface to the *project's* `.claude/` (`checks/budget.mjs:9`).
Two of the five surfaces do not live there in an installed project, and two more do not live in
the project at all.

Anchor each surface to where it actually is:

- **The harness's own root is discoverable from the check itself.** `budget.mjs` sits at
  `<harness>/checks/budget.mjs`, so its grandparent is the harness root — `.claude/` in the
  self-install, `.claude/runtime/` in an installed project. `test/_paths.mjs` already documents
  this same "walk up from your own file" assumption, so it is not a new one.
- **Hook bindings and hook source need no record at all.** They are vendored, so they are
  reachable from the harness root in both layouts. This alone removes two of the four zeros.
- **Skills and agents genuinely are not in the project.** They reach a project through the
  plugin, so nothing on disk under the project can be counted. This is the only surface that
  needs the installer to write something down, and `init` already holds the answer: it runs
  *from* the harness source, which contains `skills/` and `agents/`, and it already reads that
  source's hook registry at `bin/harness:45`.
- **Counting is live-plus-recorded, and the two never overlap.** Skills and agents present in
  the project are counted from disk; the recorded shipped counts are added only when the
  harness root is not the project's `.claude/`. In the self-install the recorded counts do not
  exist and the live count is the whole truth, so this repository cannot double-count itself,
  and a thirteenth skill added *here* still goes red.

The record is a generated file beside `settings.json`, not under `state/` — `state/` is the one
entry in the installed `.gitignore`, so a record written there would vanish on a cold clone and
reproduce the defect in CI (spec behaviour 5).

## Files

Every path this change touches. `harness check --stage commit` compares the diff against this
list — if they disagree, update this block in the same commit or revert the change.

```
.claude/checks/budget.mjs
.claude/bin/harness
test/budget.test.mjs
README.md
```

**Amended during implementation — `README.md` is edited but deliberately left uncommitted.**
The file already carried an uncommitted ~320-line rewrite belonging to another chain when this
work started (visible in `git status` before the first edit of this change). Both README edits
required by step 8 are made and present in the working tree, but staging the file would fold
that other chain's rewrite into this commit and make the diff unreviewable. Committing it is the
owner's call once the other chain lands; the two edits are the tree block above and the
"inherits that budget spent, not empty" paragraph.

Deliberately **not** touched, though each was considered:

- `.claude/lib/config.mjs` — no limit changes, and `cfg.limits` already carries them.
- `.claude/templates/gitignore` — it ignores `state/` only, so the record is committed by
  default. Behaviour 5 is satisfied by choosing the location, not by editing this file.
- `.claude/CLAUDE.md`, `docs/CONSTITUTION.md` — "the budget is full" and "Law 5 is enforced by
  `test/budget.test.mjs`" both stay true.

## Order of work

Ordered so the defect is demonstrably fixed before the machinery for the harder half exists.

1. **Red first, cheapest possible.** Extend `test/budget.test.mjs` with a test that runs
   `harness init --into <mkdtemp>` — the fixture pattern already in `test/lifecycle-cli.test.mjs:12-18`
   — and asserts the installed project measures 5 hook bindings. It reads 0 today. One
   assertion, unambiguously red.
2. **Anchor the vendored surfaces to the harness root.** `budget.mjs` resolves its own location
   and reads `hooks/hooks.json` and `hooks/*.mjs` from there. Step 1 goes green, and
   `hook_loc` becomes non-zero in an installed project. No record exists yet; skills and agents
   still read 0.
3. **Record the shipped counts at install time.** `init` counts skills and agents in the source
   it is installing from and writes them beside the generated `settings.json`, in the same
   branch that already knows it is not a self-install (`bin/harness:81-85`). Assert the file
   appears, and that a self-install does not write one.
4. **Add recorded to live.** `budget.mjs` adds the recorded counts when the harness root is not
   the project's `.claude/`. The installed project now reads 12 and 3. Spec behaviour 1 is met.
5. **Project-added counts against the same ceiling.** Add a skill directory to the temp project
   and assert it measures 13 and that `--stage commit` fails. Spec behaviour 2.
6. **An unaccountable surface fails.** Delete the record from an installed project; assert the
   control's verdict is `fail`, not `pass`/`skipped`/`errored`, and that the finding names the
   surface. Spec behaviour 4.
7. **`doctor` stops printing a confident zero.** A surface that could not be accounted for
   renders as `?`, not `0` and not `null` (`bin/harness:108`).
8. **Docs last.** README's installed-layout tree gains the generated file; the "deliberately
   fixed at 12 skills, 3 agents, and 5 hooks" paragraph gains the sentence that an installed
   project inherits that budget spent rather than empty.

## Proof

Which test demonstrates each spec behaviour. "Tests pass" is not proof; name the test.

| Spec behaviour | Test |
|---|---|
| 1. Installed project reports the harness's own counts | `test/budget.test.mjs` — *"an installed project measures the harness it was given"*: init into mkdtemp, assert `skills=12 agents=3 hooks=5` and `hook_loc > 0` |
| 2. One ceiling over harness-supplied + project-added | `test/budget.test.mjs` — *"a project inherits a spent budget, not an empty one"*: add one skill dir to the installed project, assert `skills === 13` and `run()` verdict `fail` |
| 3. Self-install unchanged | `test/budget.test.mjs` — the existing *"the harness stays inside its own budget"*, unmodified, plus *"the self-install measures the harness itself, not a record"* asserting `skills=12 agents=3 hooks=5`. **Amended during implementation:** `hook_loc` is asserted `> 0` rather than pinned at 127. Pinning it would turn any unrelated edit to a hook file red against a limit of 600, which grades the wrong thing — the limit's job is to catch growth, and `test/budget.test.mjs`'s original assertion already enforces the ceiling. |
| 4. Unaccountable surface fails, not errors | `test/budget.test.mjs` — *"a budget that cannot account for a surface is red, not green"*: remove the record, assert `verdict === 'fail'` and the finding names the surface |
| 5. Record survives a clone | Same test as 4, plus an assertion that the record's path is not matched by the installed `.claude/.gitignore` |
| 6. Re-running the installer refreshes it | `test/budget.test.mjs` — *"re-running init refreshes the recorded inventory"*: hand-edit the record to an under-count, re-run `init`, assert the count is restored |
| 7. Derived, never hand-maintained | **Amended during implementation:** the original row claimed `test/contracts.test.mjs` asserts `harness.toml` is the only hand-edited registry. It does not — that claim was wrong and is withdrawn. Proven instead by `test/budget.test.mjs` — *"re-running init refreshes the recorded inventory"*: a hand-edited record is believed until `init` runs and then overwritten, so hand-editing cannot survive. The generated file also carries its own `note` saying so. |
| 8. Never reads outside the repository | `test/budget.test.mjs` — *"the budget reads nothing outside the project"*: run `measure()` against the temp project with `HOME` pointed at an empty directory and assert the counts are unchanged |
| 9. Proven outside this repository | Every test above except the behaviour-3 one runs against an mkdtemp project, not against `ROOT` |
| 10. Nothing previously proven is unproven | `test/contracts.test.mjs` and `test/lifecycle-cli.test.mjs` run unmodified: `settings.json` still generated, marketplace still kernel-only, shim still independent of the installing checkout |

## Risks

| Risk | Mitigation |
|---|---|
| A record written by an older harness under-reports after an upgrade, and the budget silently accepts it | Behaviour 6's test pins that `init` rewrites it. `init` is documented as safe to re-run; README step 8 says to re-run it on upgrade. Residual risk accepted: a *valid but stale* record cannot be distinguished from a correct one without reading the plugin, which behaviour 8 forbids. |
| Self-install double-counts if a record ever appears in this repo | The record is written only in the `!self` branch (`bin/harness:81`), and `budget.mjs` adds recorded counts only when the harness root differs from the project's `.claude/`. Both conditions are asserted in step 3's test. |
| Behaviour 2 turns existing downstream installs red on their next commit | Intended, and flagged at gate 1 where the owner accepted it. It is the control starting to work. No mitigation beyond the README sentence in step 8. |
| Resolving the harness root from the check's own file breaks if `budget.mjs` is moved or copied | Same assumption `test/_paths.mjs` already documents and centralises. The move would break `runner.mjs`'s `LOCAL_CHECKS` import first, loudly. |
| `--stage commit` is currently unreachable in this repo because `--stage stop` fails on the stale test glob | Pre-existing, belongs to `empty-suite-is-not-a-pass`. Implementation verifies with `node --test test/*.test.mjs` directly and says so, rather than repairing another chain's target to get a green. |
