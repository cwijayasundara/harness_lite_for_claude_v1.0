# Spec: init-delivers-skills-and-agents

- **Date:** 2026-08-24
- **Intent:** [.claude/artifacts/intent/init-delivers-skills-and-agents.md](../intent/init-delivers-skills-and-agents.md)
- **Status:** approved <!-- draft | approved  (HUMAN GATE 1) -->

## Out of scope

Written first, deliberately. None of the following is part of this change.

- The sensor gauntlet — file length, function length, cyclomatic complexity, dependency-structure
  checks, mutation testing, coverage floors. Investigated separately; it belongs to its own intent.
- Pinning models per agent, and any change to how many agents exist or what they may do.
- Renaming the GitHub repository. It keeps the name `harness_lite_for_claude_v1.0`.
- Publishing to a public or third-party plugin registry.
- Any change to the AIDLC stage sequence, the three human gates, or the artifact templates.
- Automatic installation of the plugin with no human action. Measured during the intent and found
  not to exist; the two one-time commands stay.
- Automatic migration of projects installed by the previous `init`. The one known install is
  re-initialised by hand.
- Windows support. The shim and the CI bootstrap target POSIX shells only.

## Behaviour

Each is independently testable. Behaviours 1–8 and 12–13 are testable offline with no API key;
9 and 14 require a machine with Claude Code; 15 requires CI.

**Installation produces a declaration, not a copy**

1. After `harness init --into <dir>` on an empty git repository, `<dir>/.claude` contains no
   `runtime/`, `lib/`, `checks/`, `hooks/`, `skills/` or `agents/` directory. The harness is not
   present in the project in any form.
2. After the same run, `<dir>/.claude/settings.json` enables exactly one plugin — the harness — and
   declares no `hooks` key of its own.
3. No file `init` writes under `<dir>/.claude` contains the absolute path of the machine that ran
   it. Every path written is relative or a plugin-root placeholder.
4. `init` writes an install record naming the marketplace, the plugin, and the exact commit of the
   harness checkout that produced it. When the harness is not a git checkout, the record names the
   plugin's declared version and says the commit is unknown, rather than omitting the field.
5. Re-running `init` over an existing install rewrites only the generated files. An existing
   `harness.toml` and an existing project `CLAUDE.md` are left byte-identical.

**The declaration resolves**

6. The plugin identifier `init` writes into a project's settings resolves against this
   repository's own marketplace manifest: the marketplace name, the plugin name, and the
   identifier written are mutually consistent, and a mismatch fails the suite.
7. The marketplace manifest's source is this repository's actual remote, reachable by someone who
   is not the author, and is not a filesystem path.
8. Every install instruction in `README.md` names that same repository, marketplace and plugin.
   No instruction references a repository, marketplace or plugin that does not exist.
9. Following the README's install sequence verbatim on a machine with none of it installed makes
   the twelve skills and three agents available in a project that ran `init`, with no step the
   README does not list.

**Loading happens once**

10. A machine with the plugin installed, opening this repository, loads each guide exactly once and
    presents exactly five hook bindings. The repository is both the harness and a project governed
    by it, and must not be governed twice. *(Carries open question 1 from the intent — see Policy
    concerns.)*

**The command works in both places**

11. `.claude/bin/harness <command>` succeeds in an installed project both on a machine where the
    harness came from the plugin cache and in CI where it came from a clone, using the same command
    text in both.
12. When `.claude/bin/harness` cannot locate the harness, it exits non-zero and prints the two
    setup commands by name. It never fails silently and never falls back to a partial harness.
13. In this repository, the command printed by the SessionStart banner and by the project
    `CLAUDE.md` is a command that runs successfully here.

**The guard guards writes only**

14. A shell command that names a protected path but writes only to an unprotected destination is
    allowed. In particular, a command whose only `>` is a stderr redirection such as `2>&1` or
    `2>/dev/null` is not treated as writing to a protected path.
15. A shell command that does write to a protected path is still denied, with the existing message.

**CI**

16. The CI job that measures token cost against the bundled example project runs successfully. The
    example project is a real installed project, not a partially populated directory.
17. A project that installed the harness can run the `commit` stage in CI on a cold clone, with no
    Claude Code and no plugin cache present, by fetching the harness at the commit named in its
    install record.

**Coverage of the seam**

18. The suite contains a test that installs the harness into a fresh temporary git repository and
    asserts behaviours 1–8, 12, 14 and 15 in that installed layout. It runs offline, requires no API
    key, and is deterministic.

## Domain vocabulary

- **Guides** — the twelve skills, three agents, `CLAUDE.md` and the artifact templates. They act
  before work happens.
- **Sensors** — the checks, the five hook bindings and the ledger. They observe the result.
- **Installed layout** — a project that declares the harness. Its `.claude/` holds `harness.toml`,
  a project `CLAUDE.md`, `artifacts/`, `state/`, the generated settings and the install record.
- **Self-install layout** — this repository, where the harness and the project governed by it are
  the same tree. Historically the only layout that worked.
- **Install record** — the generated file naming the marketplace, plugin and commit a project
  installed. Committed, never under `state/`. It is what lets the budget count guides that are
  deliberately absent, and what lets CI fetch the right harness.
- **Pod** — the team sharing one project and therefore one harness version.

## Constraints and invariants

- Zero dependencies. The suite runs on a cold clone with no install step, and the new seam test
  must not change that.
- The budget stays at skills 12, agents 3, hooks 5. This change must not require raising a limit.
- The budget never reports a confident zero for a surface it could not account for. A project
  missing its install record fails the budget rather than passing it.
- Hooks fail open. A harness that cannot be located must degrade to no enforcement, never to a
  wedged session — but behaviour 12 requires that the CLI itself says so loudly.
- The guard is a guard, not a permission system. Behaviour 14 deliberately accepts that a write may
  slip through in exchange for never blocking a read.
- No file the harness generates may contain a path specific to one machine.
- The seam test must not require network access, an API key, or an installed Claude Code.

## Visual design

Not applicable. This change has no user interface; its surfaces are a CLI, two generated files and
a README. No design directory is required and its absence is not a flagged concern.

## Policy concerns flagged

Raised, not resolved.

1. **This repository is governed by the harness it ships.** Behaviour 10 requires it to load once.
   Either it stops shipping its own hook wiring and consumes the plugin like any other project, or
   it stops being self-governing. `.claude/CLAUDE.md` states there is no self-exemption, which
   points at the first, but the consequence is that working on the harness requires the plugin
   installed. This was carried unanswered from the intent. **Owner: author, before the plan.**
2. **Plugin installation is user-scoped and enables globally.** Observed during the intent: after
   `claude plugin install`, the harness was enabled for every project on the machine, not only
   those that declare it. A pod member therefore gets the AIDLC guides in unrelated repositories.
   Whether that is acceptable, or whether the README should direct project-scoped installation,
   is a policy call. **Owner: author.**
3. **Repository visibility.** The pod outcome assumes every member can clone the harness
   repository. If it becomes private, the marketplace needs an authentication story and behaviour 9
   fails for everyone but the author. **Owner: author.**
4. **CI executes code fetched at run time.** Behaviour 17 has CI clone the harness on every run.
   Pinning to the recorded commit rather than a branch is the mitigation; whether that is
   sufficient for the pod's supply-chain posture is not mine to decide. **Owner: author.**
