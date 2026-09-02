# Intent: budget-blind-in-installed-layout

- **Date:** 2026-08-24
- **Opened at:** 2026-08-24T16:34:20.972Z
- **Author:** cwijayasundara
- **Status:** approved <!-- draft | approved | closed -->
- **Source:** conversation, 2026-08-24 — `harness init --into .` run against a scratch repo,
  followed by "the budget check is blind in an installed layout"

## Problem

The budget is the one control in this harness that cannot be argued with. `.claude/CLAUDE.md`
states it as law — "The budget is full: skills 12/12, agents 3/3, hook bindings 5/5. Adding one
means deleting one" — and `checks/budget.mjs` is that law in mechanical form. It is the reason a
twelfth skill costs a deletion instead of a discussion.

In every repository except this one, it measures nothing and reports pass.

`harness init --into .` was run against `claude_harness_lean_v1_test`. The install is healthy:
`status`, `doctor` and `check --stage commit` all succeed, and the generated `settings.json`
wires five live hook bindings. `doctor` then reports:

```
budget    skills=0/12  agents=0/3  hooks=0/5  hook_loc=0/600  claude_md_lines=48/120
```

Five bindings exist, are wired, and fire. The budget says zero. `check --stage commit` prints
`PASS  budget`.

The cause is a layout the check does not know about. `checks/budget.mjs:9` takes
`cfg.layout.claude` and joins `hooks/hooks.json`, `hooks/*.mjs`, `skills/` and `agents/` onto
it. That is where those directories live in *this* repo, because this repo is the harness. An
external install puts them somewhere else: `bin/harness:83` copies `bin`, `checks`, `hooks`,
`lib` and `templates` into `.claude/runtime/`, deliberately, so the generated shim does not
depend on a checkout or plugin-cache path that may move. `skills/` and `agents/` are not copied
at all — they reach a project through the plugin, and the budget has never had any way to see
them there.

So three of the five limits read zero for structural reasons, one (`claude_md_lines`) happens
to still work, and the whole thing reports pass.

It has never been caught because the only test of it is the only case that passes.
`test/budget.test.mjs:11` hand-builds a layout pointing at this repository's own `.claude/` and
asserts the harness is inside its own budget. That assertion is true and worth keeping. It also
guarantees that the self-install — the single layout where the paths coincide — is the only
layout ever exercised.

The failure mode is worse than a wrong number. A control that reports `pass` while measuring
nothing is indistinguishable, in the ledger, from a control that is doing its job and finding
nothing wrong. `ledger audit` exists to decide which controls earn their place; it cannot
retire this one for never firing, and it cannot flag it for being unable to fire. The harness's
own instrument for detecting decoration is blind to this particular piece of decoration.

## Proposed outcome

In any repository with the harness installed, the budget measures the total context the agent
actually receives, and one ceiling covers all of it — controls the harness supplies and
controls the project adds, counted together against `skills = 12`, `agents = 3`, `hooks = 5`.

Concretely: an installed project that adds a thirteenth skill fails `--stage commit`, and the
only way past is a deletion, whether the deleted skill came from the harness or from the
project. A project inherits a full budget, not an empty one — the harness's twelve skills are
spent, not free.

Two properties have to hold for that to be worth anything:

- **The number is the truth or the check refuses to run.** If the budget cannot locate a
  surface it is supposed to count, it must say so and fail, not silently return zero. A quiet
  zero is what produced this intent.
- **It is proven somewhere other than this repo.** The fix is not done when
  `test/budget.test.mjs` passes; it is done when a test measures a freshly initialised project
  and sees the harness's own five bindings.

## Affected users and systems

- Anyone who installs this harness into their own repository — today, all of them, silently.
- `.claude/checks/budget.mjs` — the check itself.
- `test/budget.test.mjs` — the test whose coverage shape hid this.
- `.claude/bin/harness` (`init`, `doctor`) and `.claude/lib/config.mjs`, which owns
  `cfg.layout` and the default limits.
- `ledger audit` and `harness status`, which report a budget they cannot currently trust.
- Not affected: this repository's own numbers. The self-install measures correctly today and
  must still read `skills 12/12 · agents 3/3 · hooks 5/5` afterwards.

## Constraints

- **One ceiling over the total, not a project allowance on top of a fixed harness cost.**
  Decided by the owner, 2026-08-24, choosing between three readings of what the budget governs.
- Zero dependencies. The check must still run on a cold clone with no `node_modules`.
- No limit may be raised to accommodate the corrected count. If honest measurement puts an
  installed project over budget, that is the control working.
- `settings.json` stays generated from `hooks/hooks.json`; nothing here makes it hand-edited.
- The self-install path must keep working unchanged — `harness init` on this repo must not
  start writing a `runtime/` copy of itself (`bin/harness:81` guards this today).

## Open questions

1. **Where does the check find plugin-delivered skills and agents?** They are not in the
   project at all. On this laptop `~/.claude/plugins/installed_plugins.json` does not list
   `lean-harness`, so even the scratch install has no skills — meaning its generated project
   memory instructs the agent to "use the matching `intent`, `spec`, `plan`, `implement` and
   `review` skills" that exist nowhere. Whether the budget reads the plugin cache, reads
   `CLAUDE_PLUGIN_ROOT`, or requires the harness to record its own inventory at `init` time is
   the central design question. *Answers to: whoever writes the spec.*
2. **Is a missing surface `n/a` or `fail`?** The outcome above says a surface the check cannot
   locate must fail rather than return zero. But this repo already holds the opposite rule for
   a different case — "a metric that depends on which tools are installed grades the laptop,
   not the change. Mark it `n/a`." A plugin that is legitimately not installed may be the
   `n/a` case rather than the failure case. These need to be told apart before the spec fixes
   a verdict. *Answers to: whoever writes the spec.*
3. **Does `hook_loc = 600` still mean anything once it counts a vendored runtime?** The limit
   was set against hand-written hook source in this repo (127 lines today). If an installed
   project's count includes `runtime/hooks/dispatch.mjs`, the number is the same source
   measured from a different place — but the spec should confirm that is intended and not a
   second, unrelated definition of the same limit. *Answers to: whoever writes the spec.*
4. ~~**Is the v6 `/scaffold` direction — selective copy driven by the user's use case, instead
   of `init`'s blind runtime copy — part of this?**~~ **Answered by the owner, 2026-08-24: no,
   separate intent.** Replacing the install mechanism is its own outcome with its own risk.
   This intent fixes a control that lies about the layout that exists today. If the layout
   later changes, the test written here is what proves the budget survived it.
