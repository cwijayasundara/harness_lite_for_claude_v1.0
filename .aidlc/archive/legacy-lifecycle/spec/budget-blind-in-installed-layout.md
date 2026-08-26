# Spec: budget-blind-in-installed-layout

- **Date:** 2026-08-24
- **Intent:** [.claude/artifacts/intent/budget-blind-in-installed-layout.md](../intent/budget-blind-in-installed-layout.md)
- **Status:** approved <!-- draft | approved  (HUMAN GATE 1) -->

## Out of scope

Written first. This change sits next to five things it must not touch, three of which were
found while gathering evidence for it.

- **What `harness init` copies, and the `runtime/` split itself.** Owner decision, 2026-08-24:
  the v6 `/scaffold` direction — selective install driven by the user's use case — is its own
  intent. This change makes the budget see the layout that exists today. It does not change
  that layout, and the test it adds is what will prove the budget survived the layout changing.
- **A fresh install passing `--stage stop` having run nothing.** Observed 2026-08-24 in the
  scratch install: all eight capability verbs ship empty, `stop = ["fast", "test"]` excludes
  `secrets`, and the stage exits 0 after four `SKIP` lines. Same family as this defect — a
  green that measured nothing — but a different control with a different `why:`. Its own intent.
- **The pre-write guard matching on command text rather than write target.** Observed twice in
  one session: a `sed -n '1,60p' .claude/harness.toml` read and an artifact write whose *body*
  quoted two protected filenames were both refused. Its own intent.
- **The `empty-suite-is-not-a-pass` chain and the stale `[checks].test` glob it fires on.**
  In flight and uncommitted. This change neither repairs nor worsens it.
- **Raising any limit.** If honest measurement puts a project over budget, that is the control
  working. The outcome is explicitly not satisfiable by making the ceiling bigger.

## Behaviour

1. **The budget reports the harness's own controls in an installed project.** In a repository
   that has had `harness init` run into it and contains no controls of its own, the budget
   reports the same counts the harness reports about itself: 12 skills, 3 agents, 5 hook
   bindings, and a hook source line count equal to the harness's own. Today that repository
   reports `0`, `0`, `0`, `0` and passes.

2. **One ceiling covers harness-supplied and project-added controls together.** A project that
   adds one skill of its own to a full harness measures 13 against a limit of 12 and fails
   `--stage commit`. A project inherits a spent budget, not an empty one. The only way to add
   is to delete, and it does not matter which side the deleted control came from.

3. **The self-install is unchanged.** This repository continues to measure
   `skills 12/12 · agents 3/3 · hooks 5/5 · hook_loc 127/600 · claude_md_lines 62/120`, and
   `harness init` run here still refuses to write a copy of the harness into itself.

4. **A surface the budget cannot account for fails the stage.** If the record of what the
   harness installed is absent, unreadable, or does not describe every surface the budget is
   supposed to count, the control's verdict is `fail` — not `pass`, not `skipped`, and not
   `errored`. The reason names which surface could not be accounted for.

   `errored` is specifically excluded: a stage's success is `every(verdict !== 'fail')`
   (`lib/runner.mjs:103`), so an errored budget would leave `--stage commit` green and
   reproduce the defect this change exists to remove.

5. **The record survives a clone.** The information the budget relies on is committed with the
   project. It is not written under the ignored state directory, because CI on a cold clone
   must measure the same numbers a developer's laptop does — and a budget that only works
   where it was installed is the same defect in a new place.

6. **Re-running the installer refreshes the record.** After the harness is upgraded and the
   installer re-run, the counts reflect the new harness, not the one that was there before. A
   stale record must not be able to under-report.

7. **The record is derived, never hand-maintained.** No human edits it, and editing it by hand
   is not how a limit gets raised. `harness.toml` remains the only hand-edited registry.

8. **The budget never reads outside the repository.** The counts are established from what the
   installer had in its hands at install time. Nothing in the check inspects the user's home
   directory, a plugin cache, or any path outside the project it is measuring.

9. **This is proven somewhere other than this repository.** A test initialises a throwaway
   project, runs the installer into it, and asserts behaviours 1 and 2 against it. The existing
   assertion that the harness fits inside its own budget stays, unmodified — it is true, and it
   is not sufficient.

10. **Nothing that was proven before is unproven now.** `settings.json` remains generated from
    the hook registry and is not hand-edited; the marketplace still ships the kernel plugin
    only; the installer's generated shim still points at a runtime path that does not depend on
    the checkout that ran it.

## Domain vocabulary

- **Self-install** — this repository, where the harness measures itself and the directories the
  budget looks for happen to be exactly where it looks.
- **Installed layout** — any other repository, where the harness's executable surfaces are
  vendored under a runtime directory and its skills and agents are not present in the project
  at all.
- **Surface** — one thing the budget counts: skills, agents, hook bindings, hook source lines,
  project-memory lines.
- **Harness-supplied** vs **project-added** — which side a control came from. Behaviour 2 makes
  the distinction irrelevant to the ceiling and relevant only to the report.
- **The record** — whatever the installer writes down about what it installed. Named as a
  concept, not a file; the plan chooses its form and location subject to behaviours 5–8.

## Constraints and invariants

- Zero dependencies. The check must run on a cold clone with no `node_modules`.
- No limit may be raised in this change. If the corrected count exceeds a ceiling, that is a
  finding, not a reason to edit `harness.toml`.
- The budget's verdict must remain decidable offline and without network access.
- Reading the user's home directory or Claude Code's plugin cache is forbidden by behaviour 8.
  Owner decision, 2026-08-24, choosing an install-time record over cache inspection. This also
  keeps the check from depending on an on-disk format the project does not own.
- A control that cannot measure must be louder than a control that measured zero. This is the
  whole point of the change and must not be traded away for a green build.

## Visual design

Not user-facing. No design directory required.

## Policy concerns flagged

- **Two of the intent's open questions were resolved from the code rather than with the owner,
  and both are overturnable at this gate.**
  - *Is a missing surface `n/a` or `fail`?* Resolved as `fail` (behaviour 4). The competing
    rule in project memory — "a metric that depends on which tools are installed grades the
    laptop, not the change; mark it `n/a`" — governs metrics whose *value* varies by machine.
    What the installer put on disk is a property of the install, not of the laptop, so it has
    no legitimate `n/a` case. *Owner may overturn: repository owner.*
  - *Does `hook_loc = 600` still mean anything once it counts a vendored runtime?* Resolved as
    yes (behaviour 1). The vendored hook source is byte-identical to this repository's — the
    same 127 lines measured from a different path — so the limit keeps its original meaning.
    *Owner may overturn: repository owner.*
- **Behaviour 2 will make some existing installs fail on the next commit.** Any project that
  has already added skills or agents on top of a full harness goes from a silent pass to a red
  `--stage commit`, with deletion as the only remedy. That is the intended effect and it is
  also a breaking change for anyone downstream. *Resolves: repository owner, at this gate.*
- **Behaviour 5 puts a generated file into version control.** Committing derived state invites
  merge conflicts on upgrade and tempts hand-editing, which behaviour 7 forbids but cannot
  prevent. *Resolves: repository owner, at this gate.*
