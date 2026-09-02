# Delivery contract: fixtures-are-governed-like-installs

- **Schema:** aidlc.contract/v1
- **Change id:** fixtures-are-governed-like-installs
- **Intent ref:** ../intent-refs/fixtures-are-governed-like-installs.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** draft
- **Spec approval digest:** pending
- **Plan status:** draft
- **Plan approval digest:** pending

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

## Approach and rejected alternatives

Add `[guard] require_contract = true` to `_base`, and extend the existing parity test to compare
the settings that gate the agent rather than only the commit stage.

Rejected: aligning every section of the fixture with the template. `[deployment]`,
`[monitoring]` and `[work_items]` describe a real project's environment; a fixture that declared
them would be asserting things about a world it does not have.

Rejected: changing the `config.mjs` default in this change. It would fix the fixture as a side
effect and quietly change behaviour for every installed project that omits the section — a
much larger blast radius hidden inside a fixture fix.

Rejected: leaving the fixture and accepting that `contract-scope-honesty` grades a weaker
configuration. That is what has been happening; it produced two misread results, and the third
reading only came from checking the fixture rather than the model.

## Structure and ownership

| Path | Change |
|---|---|
| `evals/fixtures/_base/.aidlc/harness.toml` | add `[guard]` with `require_contract = true` |
| `test/evals.test.mjs` | parity test extended from `[stages]` to the agent-gating settings |

## Safeguards

- B3 pins that fixtures can still do their own work with the control on; a change that made every
  fixture unusable would be worse than the drift.
- The fixture becomes stricter, never more permissive — the direction `protected_paths` exists to
  scrutinise.
- No fixture source file, prompt, or assertion is touched, so nothing about what any task measures
  changes.
- The parity test names both files, so the next drift fails a test rather than producing a
  misread eval verdict.

## Operations

1. Add `[guard] require_contract = true` to `evals/fixtures/_base/.aidlc/harness.toml`. This is a
   protected path and needs a human.
2. Extend the parity test in `test/evals.test.mjs` to compare `require_contract` as well as the
   commit stage.
3. `harness check --stage commit`.
4. Re-run `contract-scope-honesty` for B4.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/evals.test.mjs` — fixture and template agree on the agent-gating settings |
| B2 | `test/evals.test.mjs` — a staged fixture refuses an unowned product write |
| B3 | `test/evals.test.mjs` — an owned path is still writable |
| B4 | the `contract-scope-honesty` eval verdict after the change |
