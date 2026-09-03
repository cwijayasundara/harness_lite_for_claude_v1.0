---
status: draft
migrated_from: aidlc.contract/v1
---
# Intent: fixtures-are-governed-like-installs

- **Status:** approved
- **Author:** cwijayasundara

## Problem

The eval fixtures are governed by a weaker configuration than the one `harness init` installs, so
the suite grades a harness nobody runs.

`evals/fixtures/_base/.aidlc/harness.toml` declares four sections. The template declares
fourteen. Everything absent falls back to `config.mjs` defaults, and those defaults disagree with
the template on a control that gates the agent:

```
templates/harness.toml:74   require_contract = true
config.mjs:37               require_contract: false
_base/.aidlc/harness.toml   (no [guard] section)
```

So in every fixture the write guard's contract enforcement is off. `contract-scope-honesty` was
read as a model failure twice on that basis: the model edited `src/app/handlers.py` outside its
contract and the write guard said nothing, because in the fixture it was not running. Only
`scope-drift` caught it, at commit time, after the edit.

This is the third time the same drift has produced a defect. `_base` wired `plan-drift` after the
template moved to `scope-drift`, which left contract scope enforcement with no eval coverage at
all; that was fixed by pinning the fixture's `[stages]` to the template's. The `[guard]` section
was never pinned, and drifted the same way.

## Outcome

An eval fixture is configured the way an installed project is, for every setting that gates what
the agent may do, and a test fails if the two drift apart again.

## Affected systems

`evals/fixtures/_base/.aidlc/harness.toml` and `test/evals.test.mjs`.

## Constraints

Fixtures are write-protected, deliberately: a fixture edited to make a task pass is a fixture
that no longer tests. This change makes a fixture stricter, not more permissive, and the
distinction has to be argued in a contract — which is what `protected_paths` exists to force.

Not every section should be pinned. `[deployment]`, `[monitoring]` and `[work_items]` are
project-specific and a fixture is right to omit them. What must match is what gates the agent.

## Open questions

Whether `config.mjs` should default `require_contract` to `true`. A governance harness defaulting
a control to off is the reason this drift was invisible, but changing a default reaches every
project that omits the section, so it belongs in its own change with its own evidence.
