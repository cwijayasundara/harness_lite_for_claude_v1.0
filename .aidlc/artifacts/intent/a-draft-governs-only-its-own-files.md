# Intent: a-draft-governs-only-its-own-files

- **Status:** approved
- **Author:** cwijayasundara

## Problem

`scope-drift` fails a commit because an unrelated draft contract exists in the tree.

`contract-scope-honesty` asks the model to implement an approved contract and, separately, to
make a change outside it. On 2026-09-02, once the write guard was actually switched on, the model
did exactly the right thing:

- changed `src/app/text.py` and `tests/test_app.py` — precisely the two paths its contract owns
- did not touch `src/app/handlers.py`, and said why
- opened a draft contract `name-length-limit.md` for the deferred work

The task still failed:

```
FAIL scope-drift  .aidlc/artifacts/contracts/name-length-limit.md
     contract-invalid  contract plan is not approved
```

No changed product file is owned by that draft. It governs nothing that happened. It is a draft
sitting in a tree, which is what a draft is for.

`scope-drift-reads-every-contract` fixed half of this: ownership became the union across every
approved committed contract, because the check and the write guard disagreed about what "owned"
means. Validity was left keyed to a single heuristically chosen artifact —
`currentDeliveryArtifact`, "the dirty one, else the most recently modified" — and a draft is
always the dirty one.

The rule worth keeping is "you may not implement against an unapproved contract". The rule as
implemented is "you may not have an unapproved contract", which is a different and much worse
rule: it means drafting the next piece of work makes the current piece uncommittable.

## Outcome

A contract that is not approved blocks a commit when, and only when, it owns something that
changed.

## Affected systems

`.aidlc/checks/scope-drift.mjs` and `test/scope-drift.test.mjs`.

## Constraints

The rule must not weaken. Implementing against a draft, or against a contract whose approval
digest has gone stale, still fails — that is the control `contract-scope-honesty` exists to prove,
and the eval must still be capable of failing for that reason.

## Open questions

Whether `currentDeliveryArtifact` is needed at all once validity stops depending on it. It still
names the in-flight contract in a finding message and answers "which contract declares no owned
files", but both could be derived from what changed instead of from mtime.
