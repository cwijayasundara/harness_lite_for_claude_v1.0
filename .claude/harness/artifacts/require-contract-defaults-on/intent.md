---
status: closed
migrated_from: aidlc.contract/v1
---
# Intent: require-contract-defaults-on

- **Status:** approved
- **Author:** cwijayasundara

## Problem

`config.mjs:37` defaults `require_contract` to `false`. The template `harness init` installs sets
it to `true`. So the control is on for anyone who took the template and off for anyone who did
not — and the second group is invisible, because nothing reports a control that is not running.

That is how the eval fixtures ended up ungoverned. `evals/fixtures/_base/.aidlc/harness.toml`
declares four of the template's fourteen sections and no `[guard]` at all, so the write guard's
contract enforcement has never run in any eval. `contract-scope-honesty` was read as a model
failure twice before anyone checked the fixture's configuration rather than the model's
behaviour.

A governance harness that defaults its own controls to off is not lean, it is optimistic. The
failure mode is silent in exactly the way the ledger, the eval ratchet, and the scope guard all
exist to prevent: a control that is absent looks identical to a control that passed.

## Outcome

A project that says nothing about `[guard]` gets the control, not the absence of it. Turning it
off becomes a decision someone wrote down.

## Affected systems

`.aidlc/lib/config.mjs`, and the fixture-parity test in `test/evals.test.mjs`, which compares
declared text and must compare effective configuration instead.

Four configurations in this repository omit `[guard]`: the `_base` eval fixture and the three
`examples/` projects. All four gain the control.

## Constraints

The template must keep declaring `require_contract` explicitly. A default is what happens when
nobody chose; the template is where someone chose, and reading the value there should not require
knowing the default.

Turning a control on can only ever break work that was relying on it being off. That is the point,
but it means the examples have to be checked rather than assumed.

## Open questions

Whether `protected_paths` and `deny_bash` should also default to something other than empty. They
are lists of project-specific paths and patterns, so an empty default is a genuine "nothing to
declare" rather than a control switched off. Not changed here.
