# Intent: checklist-names-no-sample

- **Date:** 2026-08-25
- **Opened at:** 2026-08-25T05:34:06.765Z
- **Author:** cwijayasundara
- **Source:** conversation, 2026-08-25 — dead-code audit of the tree
- **Status:** draft <!-- draft | approved | closed -->

## Problem

`harness doctor --enterprise` prints five checklist items. Four of them are measured against
the repository and can change. The fifth cannot:

```
need  managed-settings  Managed settings must be pushed from the admin console or MDM.
                        Git .claude/settings.json is bypassable.
```

`managed-settings` is hardcoded `ok: false`. There is no machine state, no configuration, and
no admin action that turns it green — a reader who does exactly what the line asks still sees
`need` on the next run. It is the one item in the checklist that reports nothing.

The line also asks the reader to push managed settings without telling them what to push.
`.claude/templates/managed-settings.json` exists and is a complete, working sample — it denies
`Read(.env*)` and `WebFetch`, allows only git and the harness, sets
`disableBypassPermissionsMode`, and turns on the sandbox. No code path references it. `harness
init` copies four templates and this is not one of them. So the repo ships the answer to its
own checklist item and never mentions it, in either direction: the item names no file, and the
file is reachable only by someone already browsing `templates/`.

This is the failure mode `harness.toml` already names in its own comment — *"how a gate becomes
decoration"*. A permanently-red item trains the reader to skim past the whole checklist, which
costs the four items that do work.

## Proposed outcome

Someone running `harness doctor --enterprise`:

- On a machine where managed settings are genuinely in force, sees the item **green**, naming
  the path that made it green.
- On a machine where they are not, sees `need` **and the path of the sample to copy**, so the
  line is actionable on first read.
- On a machine where the file is present at the managed path but asserts none of the controls
  that make it worth having, sees `need` with the missing keys named — a file at the right path
  that locks nothing down does not count as managed settings.

`.claude/templates/managed-settings.json` is reachable from the tool that asks for it, and no
file in the tree is referenced by nothing.

## Affected users and systems

- **The operator running `doctor --enterprise`** — the only consumer of this output. Today they
  are handed an instruction with no artifact and no confirmation.
- **`.claude/lib/guard.mjs`** — `enterpriseChecklist()` is where the hardcoded item lives.
- **`.claude/templates/managed-settings.json`** — currently unreferenced.
- **`test/playbook-pack.test.mjs:58`** — asserts only that the string `managed-settings`
  appears in the output. It passes today and would keep passing if the item were deleted
  outright, so it is not currently protecting anything about this behaviour.

## Constraints

- **The checklist must not start grading the laptop.** `doctor` returns 0 regardless of
  checklist state and must continue to — this is an operator report, not a build gate. The
  repo's existing rule (*"a metric that depends on which tools are installed grades the laptop,
  not the change"*) bans laptop-dependent results from **failing a build**; it does not ban an
  operator command from reporting what is true on the machine in front of it.
- **Zero dependencies.** No library for reading or validating the managed settings file.
- **A green item must mean something.** Presence alone is not the bar — decided in conversation,
  2026-08-25. Otherwise this change replaces an item that can never pass with one that cannot
  fail, which is the same defect wearing the opposite sign.
- **The harness must not claim authority it does not have.** Reading the OS managed-settings
  path reports what Claude Code would load. It does not prove an MDM pushed it, and must not
  say that it does.
- **No new skill, agent, or hook binding.** The budget is full at 12/12, 3/3, 5/5.

## Open questions

1. **Which OS paths count as the managed path, and what happens on a platform not in the list?**
   macOS and Linux are known. A platform the harness does not have a path for must not read as
   `ok`, but reporting it as `need` is also wrong — it is unknown, which is a third state the
   checklist does not currently have. *Answered by: the repository owner.*
2. **Which keys make the file "worth having"?** The sample sets four candidates
   (`disableBypassPermissionsMode`, `allowManagedPermissionRulesOnly`, `allowManagedHooksOnly`,
   `sandbox.enabled`). Requiring all four means the harness dictates enterprise policy;
   requiring one means the bar is nearly presence again. *Answered by: the repository owner.*
3. **Should `harness init` start copying the sample into new installs?** It would make the file
   reachable, but it also puts a file that must never be trusted as managed settings inside the
   repo that must never be trusted — arguably making the confusion worse, not better.
   *Answered by: the repository owner.*
4. **Does `test/playbook-pack.test.mjs:58` get strengthened here or in its own change?** The
   assertion is too weak to protect either the old or the new behaviour. *Answered by: the
   repository owner.*
