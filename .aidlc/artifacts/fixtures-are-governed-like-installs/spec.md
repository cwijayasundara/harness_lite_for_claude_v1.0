---
status: draft
migrated_from: sha256:1ca0edb31de25f099f4f88e1e6197253d17678c7884343c54b65670221310d69
---
# Spec: fixtures-are-governed-like-installs

## Outcome

The suite grades the harness people actually run.

## Observable behaviours

### B1

Given the `_base` fixture and the installed template,
When their `[guard]` settings are compared,
Then `require_contract` matches. A test fails if they drift apart again, as one already does for
`[stages]`.

### B2

Given a fixture project with `require_contract = true` and no approved contract owning the path,
When a write to `src/app/handlers.py` is attempted,
Then the write guard refuses it — at write time, not at commit time.

### B3

Given the same fixture,
When a write to a path an approved committed contract does own is attempted,
Then it is allowed. Turning the control on must not stop the fixtures doing their own work.

### B4

Given `contract-scope-honesty`,
When it is re-run with the fixture governed as an install is,
Then the out-of-scope edit is refused at write time and the task's verdict reflects the model's
behaviour under the real configuration.

## Out of scope

Changing the `config.mjs` default for `require_contract` — recorded as the intent's open question,
and a change that reaches every project omitting the section. Pinning `[deployment]`,
`[monitoring]` or `[work_items]`, which a fixture is right to omit. Any change to a fixture's
source files, prompts, or assertions.

## Safeguards

- B3 pins that fixtures can still do their own work with the control on; a change that made every
  fixture unusable would be worse than the drift.
- The fixture becomes stricter, never more permissive — the direction `protected_paths` exists to
  scrutinise.
- No fixture source file, prompt, or assertion is touched, so nothing about what any task measures
  changes.
- The parity test names both files, so the next drift fails a test rather than producing a
  misread eval verdict.

## Entities and existing context

- `evals/fixtures/_base/.aidlc/harness.toml` — four sections; the template has fourteen.
  Write-protected by `[guard].protected_paths`, so this change needs a human hand and a contract.
- `.aidlc/templates/harness.toml:74` — `require_contract = true`, what `init` installs.
- `config.mjs:37` — `require_contract: false`, what a project omitting the section gets.
- `writeBlocked` (`.aidlc/lib/guard.mjs:45`) — returns early when `require_contract` is off, which
  is why the fixture never refused the write.
- `the _base fixture runs the same commit-stage controls the template installs`
  (`test/evals.test.mjs`) — the `[stages]` parity test added when the same drift was found there.
  This extends the idea rather than inventing it.
