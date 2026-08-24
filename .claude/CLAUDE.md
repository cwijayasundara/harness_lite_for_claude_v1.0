# lean-harness

A harness for Claude Code: guides, sensors, and the ledger that decides which survive.
This repo governs its own development with the harness it ships. There is no self-exemption.

## AIDLC workflow

Users start or resume in natural language: “Take this through the Lean AIDLC workflow” or
“Approved. Continue the workflow.” Inspect `.claude/artifacts/` and resume the first incomplete
stage: `intent -> intent approval -> spec -> spec approval -> plan -> plan approval -> implement
-> review`. Use the matching skills. Invoke harness commands yourself; never make the user drive
the workflow through the CLI.

## Agent commands

```
node .claude/bin/harness check --stage stop     # secrets + the full unit suite
node .claude/bin/harness check --stage commit   # + plan-drift + budget
node .claude/bin/harness handoff --write        # next-stage draft from a committed approval
node .claude/bin/harness monitor detect         # control-band breach → incident + intent
node .claude/bin/harness lock tests             # pin tests during a fix; lock clear to release
node .claude/bin/harness worktree <slug>        # isolated checkout for a disjoint plan slice
node .claude/bin/harness doctor --enterprise    # managed-settings checklist (git is not MDM)
node .claude/bin/harness status                 # artifact chain + playbook indicators
node .claude/bin/harness ledger audit           # which controls earn their place
```

Never report a task complete without running and pasting the output of `--stage stop` yourself.

## Conventions

- **Zero dependencies.** No `node_modules`, ever. The suite must run on a cold clone. If a
  problem seems to need a library, it is the wrong problem — see the tree-sitter decision in
  `docs/BUILD-PLAN.md` Phase 3.
- **The budget is full**: skills 12/12, agents 3/3, hook bindings 5/5. Adding one means
  deleting one. `--stage commit` enforces this; do not raise a limit to get past it.
- Control flow goes in `bin/harness`, never into a SKILL.md. A numbered sequence longer than
  eight steps in a skill fails `test/contracts.test.mjs`.
- `harness.toml` is the only hand-edited registry. `settings.json` is **generated** from
  `hooks/hooks.json` by `harness init` — never edit it by hand.
- Every control carries a `why:` naming the defect it prevents. No why, no control.
- Tests are `node:test`, zero-dep, and live in `test/`. Fixtures under `evals/fixtures/` are
  write-protected: a fixture edited to make a test pass is a fixture that no longer tests.

## The artifact chain

`intent -> spec -> plan -> diff`, all under `.claude/artifacts/`. `plan.md` names the files it
touches and the diff must match, or the plan is updated in the same commit — `plan-drift`
enforces it. Three human gates: spec approved, plan approved, PR merged.

## Things this project gets wrong

Added the **second** time a mistake happens, never the first.

- Blanking string literals when scanning for call sites also blanks template literals and
  f-strings, losing every interpolated call. Keep the interiors.
- Truncating a lock file is not releasing it unless the take path treats empty as free. The
  same applies to any state file on a mount that forbids unlink.
- A metric that depends on which tools are installed grades the laptop, not the change. Mark it
  `n/a` when the toolchain differs rather than failing the build.
- JavaScript has no inline `(?i)` regex flag. `toRegExp` translates it; do not hand-roll.
