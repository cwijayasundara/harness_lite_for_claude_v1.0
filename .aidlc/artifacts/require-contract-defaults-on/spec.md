---
status: draft
migrated_from: sha256:60e4c78d2bdf5738c36ad5a423a2f6ce3f9fdaf1442e6bd516ed68a5286c9e34
---
# Spec: require-contract-defaults-on

## Outcome

Saying nothing about `[guard]` gets you the control. Switching it off is something somebody wrote
down.

## Observable behaviours

### B1

Given a `harness.toml` with no `[guard]` section,
When it is loaded,
Then `require_contract` is `true`.

### B2

Given a `harness.toml` that sets `require_contract = false`,
When it is loaded,
Then it is `false`. A default is what happens when nobody chose; an explicit choice still wins.

### B3

Given the `_base` eval fixture, which declares no `[guard]`,
When a fixture is staged and an unowned product write is attempted,
Then the write guard refuses it — without editing the write-protected fixture, because the
default now supplies what the fixture omitted.

### B4

Given the `_base` fixture and the installed template,
When their *effective* configuration is compared,
Then `require_contract` matches. The parity test compares loaded configuration rather than
declared text, because a fixture that correctly omits a section must not fail a text comparison.

### B5

Given `contract-scope-honesty`,
When it is re-run,
Then it is graded under the same configuration a real installed project runs.

## Out of scope

Defaults for `protected_paths` and `deny_bash` — empty is a genuine "nothing to declare" for a
list of project-specific paths, not a control switched off. Any change to the template, which
already declares the value explicitly and should keep doing so.

## Safeguards

- B2 keeps an explicit `false` working, so a repository that deliberately opts out still can.
- B3 proves the fixture is governed without touching a write-protected file, which is a better
  outcome than the edit it replaces.
- The template keeps declaring the value, so reading it there never requires knowing the default.
- The three `examples/` gain the control; the suite covers `examples/scratch-py`, and a break
  there would show as a test failure rather than a surprise later.

## Entities and existing context

- `loadConfig` (`.aidlc/lib/config.mjs:37`) — `guard: { protected_paths: [], deny_bash: [],
  require_contract: false, ...(raw.guard ?? {}) }`. The spread means an explicit value still wins,
  which is what makes B2 free.
- `.aidlc/templates/harness.toml:74` — `require_contract = true`, so nothing that used `init` is
  affected by this change.
- `writeBlocked` (`.aidlc/lib/guard.mjs:45`) — returns early when the flag is off.
- `fixtures-are-governed-like-installs` — its remedy was a human edit to the write-protected
  `_base` fixture. This supersedes that: the fixture omits `[guard]` and now inherits the control,
  so the protected file does not need touching at all. Its parity test moves from text to
  effective configuration here.
- The four configurations omitting `[guard]`: `evals/fixtures/_base`, `examples/scratch-py`,
  `examples/scratch-ts`, `examples/docker-staging`.
