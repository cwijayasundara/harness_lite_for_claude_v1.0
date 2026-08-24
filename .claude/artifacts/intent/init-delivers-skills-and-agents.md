# Intent: init-delivers-skills-and-agents

- **Date:** 2026-08-24
- **Opened at:** 2026-08-24T00:00:00Z
- **Author:** cwijayasundara
- **Status:** approved <!-- draft | approved | closed -->
- **Source:** conversation — a real install into ../claude_harness_lean_v1_test produced a project with hooks, a CLI, and no guides

## Problem

A project that runs `harness init --into .` does not get a working harness, and nothing tells it so.

The harness is guides and sensors. The guides are the twelve skills, three agents, `CLAUDE.md` and
the artifact templates; the sensors are the checks, the five hook bindings and the ledger. `init`
copies the sensors into `.claude/runtime/` and does not copy the guides at all — those were meant to
arrive through a separately installed Claude Code plugin. That second install step is invisible from
inside the project, easy to skip, and was skipped: no marketplace for this harness is registered on
this machine. The result is a project where every deterministic check runs and no guide ever loads,
so Claude does not follow the AIDLC workflow and the user cannot see why.

The plugin install cannot presently succeed even when attempted:

- `README.md:24` tells you to clone `github.com/cwijayasundara/claude_harness_lean_v1.git`. No such
  repository exists. The actual remote is `github.com/cwijayasundara/harness_lite_for_claude_v1.0`.
  Every pod member following the README fails at the first command.
- `.claude-plugin/marketplace.json` is named `lean-harness-local` and its source is a directory path
  that exists only on the author's laptop. A marketplace nobody else can resolve cannot be the pod's
  source of truth.

Four further defects share one shape — the harness behaves correctly in its own repository and
silently incorrectly in a project that installed it:

- `init` writes the installing machine's absolute path into the generated settings file, which the
  README instructs the user to commit. On a teammate's machine or in CI those hook commands point at
  a path that does not exist, and hooks fail open, so the harness reports nothing and enforces
  nothing.
- The plugin and the generated settings file declare the same five hook bindings. A user who
  completes both install steps as documented runs every hook twice: two `fast` checks per edit, a
  doubled ledger denominator, and the full stop suite twice per turn. This was observed live during
  the investigation — installing the plugin at user scope while this repository also carries its own
  `.claude/`, and the harness loads twice.
- Nothing records which version of the harness a project installed, so "re-run `init` after
  upgrading" cannot be verified by anyone, including CI.
- `.claude/bin/harness` is real JavaScript in this repository and a bash shim in an installed one,
  but the SessionStart hook and `CLAUDE.md` print `bash .claude/bin/harness ...` in both. In this
  repository that command fails with a shell syntax error.

Underneath all of them: 118 unit tests pass, and `budget.test.mjs` does install into a fresh
repository — where it asserts that the number 12 was written into a JSON file, never that twelve
skills are reachable. The harness verifies its own paperwork. No test asserts what a project
actually receives, and no test exercises the channel a pod member actually uses.

A last defect is included at the author's direction although it is not seam-shaped: the bash guard
denies read-only commands. `guard.mjs:89` tests a `writeish` regex against the whole command string,
so the `>` in `2>&1` counts as a write and any command naming a protected path is denied. It fired
three times during the investigation that produced this intent: once on a `head` of a settings file,
once refusing to let this very file be written because the text names a protected path, and once on
a `cp` whose *source* was the user's global settings outside the project entirely. A guard that
blocks reading is one people learn to route around.

## What was verified

Measured on this machine before writing the outcome below, then the machine was restored to its
prior state. `~/.claude/settings.json` is byte-identical to its pre-test backup.

- `claude --plugin-dir <harness>/.claude` loads the twelve skills and three agents, headless. The
  first form in README step 6 works.
- The repository clones from GitHub over HTTPS without a credential prompt, and the marketplace
  validates. Access is not the obstacle.
- **`enabledPlugins` in a project's committed `.claude/settings.json` works with no manual step** —
  a plugin already installed on the machine was enabled for the project and its skills loaded.
- **`extraKnownMarketplaces` in project settings does not register an unknown marketplace.** The
  scratch project declared one; nothing was fetched and the machine was unchanged.
- **`enabledPlugins` enables an installed plugin; it does not install one.** With the marketplace
  registered but the plugin not installed, the skills did not load. After
  `claude plugin install`, the same project loaded them.

The consequence for this intent: two one-time commands per machine are unavoidable. Everything
after them is automatic and per-project.

## Proposed outcome

The harness is a shared dependency. A project declares which version it uses; it never contains a
copy, and joining a project costs a pod member nothing beyond a one-time machine setup.

- A pod member runs two documented commands once per machine — register the marketplace, install the
  plugin. Nothing per project, ever again.
- After `harness init --into .` and nothing else, opening the project in Claude Code makes the
  twelve skills and three agents available, because the project's committed settings enable the
  plugin. The declaration lives in a committed file; the harness itself does not.
- No copy of the harness exists under the project's `.claude/`, so there is nothing there a project
  can alter and nothing that can drift from the version the pod agreed on.
- Every hook binding fires exactly once, including in this repository, which is both the harness and
  a project that uses it.
- The project records the exact harness commit it installed, and CI runs the sensors at that same
  commit without Claude Code present.
- `.claude/bin/harness` works on a pod member's laptop and in CI, by the same command.
- Every install instruction in the README resolves — the repository, the marketplace, and the plugin
  are named consistently and reachable by someone who is not the author.
- Read-only shell commands are not denied.
- A test asserts each of the above against a freshly installed temporary project, so this class of
  defect cannot return silently.

## Decisions taken

Settled in conversation; recorded here so the spec does not reopen them.

- **Delivery is the plugin, and only the plugin.** The harness is not copied into the project. This
  is what keeps it immutable and identical across the pod, and it deletes `.claude/runtime/`.
- **The name is `lean_harness_cs_v1`**, used for both the marketplace and the plugin. The GitHub
  repository keeps its current name, `harness_lite_for_claude_v1.0`, and the marketplace points at
  it; only the two identifiers that land in a project's committed settings change. Underscores are
  valid — `claude_harness_eng_v5` is an installed plugin on this machine.
- **The marketplace source tracks `main`.** Work is merged to main and pushed to GitHub, and that is
  what a laptop resolves. The install record additionally captures the resolved commit, so CI pins
  exactly and a project can state what it got. Laptops therefore track main and can drift from each
  other until a member updates; CI never drifts. This is the accepted trade.
- **CI clones the harness at the recorded commit** on each run, rather than vendoring a runtime.
  Cloning keeps the "no copy in the project" rule intact.
- **The budget keeps one ceiling** over harness-supplied plus project-added surfaces. The install
  record therefore survives — under the plugin model it is the only thing that can account for
  guides that are deliberately not in the project. The `budget-blind-in-installed-layout` work was
  correct for this model and is retained.
- **`evals/` keeps loading the harness with `--plugin-dir`**, which under this decision is the real
  channel rather than a test-only shortcut, and is verified to work.
- **The guard is narrowed** so that reads are never denied, accepting that a write may slip through
  in exchange. It is a guard, not a permission system.

## Affected users and systems

- Every member of a pod adopting the AIDLC workflow — today none of them can install it.
- CI on a cold clone of a project that installed the harness, with no Claude Code available.
- `.claude/bin/harness` (`init`), `.claude/checks/budget.mjs`, `.claude/lib/guard.mjs`,
  `.claude/hooks/dispatch.mjs`, `.claude/templates/CLAUDE.md`, `README.md`.
- `.claude-plugin/marketplace.json`, `.claude/.claude-plugin/plugin.json` — renamed and repointed.
- `.github/` — CI must fetch the pinned harness rather than assume it is in the repository.
- This repository itself, which is both the harness and a project governed by it. It must not load
  the harness twice once the plugin is installable.

## Constraints

- Zero dependencies. No shell parser library for the guard fix — see the tree-sitter decision in
  `docs/BUILD-PLAN.md` Phase 3.
- The budget is full at skills 12/12, agents 3/3, hooks 5/5. This change must not need a raised
  limit.
- CI has no Claude Code and no plugin cache. Whatever `init` writes must be enough for CI to obtain
  and run the sensors unattended.
- The new install test must be deterministic, offline, and must not require an API key.
- Per-machine setup is two commands and is documented, not automated away. Per-project setup is
  `harness init` and nothing else.

## Open questions

1. This repository is both the harness and a project that uses it. Once the plugin is installable, a
   pod member with it installed who opens *this* repository gets the guides twice and the sensors
   twice. Does this repository stop shipping its own `.claude/settings.json` hook wiring, or does it
   stop being self-governing? The constitution says there is no self-exemption, which points at the
   first. **Author.**
2. How does `.claude/bin/harness` resolve the harness in both places? On a laptop it can read the
   install record and find the plugin cache; in CI the harness is at whatever path the clone landed.
   An explicit environment variable that CI sets, with plugin-cache lookup as the fallback, is the
   obvious shape — confirm at spec time. **Spec.**
3. Does the repository need a `.claude-plugin/marketplace.json` at its root *and* a plugin manifest
   under `.claude/`, or does the rename let those collapse into one file? **Spec.**
