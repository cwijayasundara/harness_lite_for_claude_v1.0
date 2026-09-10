---
status: draft
source: docs/DEFECT-REPAIR-PLAN.md
source_revision: 62fea335060175a6327494e6abe04cb37d3c94e4
---
# Intent: a-shell-redirect-is-a-write

- **Date:** 2026-09-10
- **Author:** cwijayasundara
- **Source:** `docs/DEFECT-REPAIR-PLAN.md` item D1, filed at the bound `source_revision`.

## Problem

**The guard answers "may this file change?" twice, and the two answers disagree.**

`.aidlc/lib/guard.mjs` has two entry points. `writeRefusal` is what the Write and Edit tools go
through; it tests the target path against the selected change's `## Files` with `matchesDeclared`.
`bashContractBlocked` is what shell commands go through; it extracts the redirect targets
correctly, and then never tests any of them:

```js
const scope = contractScopeState(cfg);
if (!scope.parseError && scope.declared.length) return null;   // guard.mjs:220
return contractRefusal(targets[0], scope);
```

The only question it asks is whether *some* change is selected with a non-empty `## Files`. If one
is, every path in the repository is writable through a shell redirect.

**The polarity is inverted.** Reproduced on this branch against the real configuration
(`require_contract = true`), with `a-run-spends-only-when-asked` selected — a change whose approved
plan names fifteen paths:

| Target | Through Bash | Through Write/Edit |
|---|---|---|
| `.aidlc/lib/graph.mjs` | allowed | refused |
| `test/guard.test.mjs` | allowed | refused |
| `evals/fixtures/clean-app/src/app/text.py` | allowed by this rule | refused |
| `docs/DEFECT-REPAIR-PLAN.md` | allowed | refused |
| `evals/run.mjs` (owned) | allowed | allowed |

With no approved plan selected, the same five targets are all **refused** on both paths. So the
bash rule is at its strictest when nothing has been approved and nothing is being built, and it
opens completely at the exact moment a human approves a plan and work begins. It is inactive
precisely when it is supposed to be active.

This file's own source document is the third row made real: `docs/DEFECT-REPAIR-PLAN.md` was
written with a heredoc redirect to a path no approved plan named, and the guard permitted it.

**What still holds.** Two other bash rules are unaffected and still fire: `bashTouchesProtected`
covers `[guard].protected_paths`, and the prompt-prefix rule covers instruction and settings
files. Fixtures and `CLAUDE.md` are therefore still defended, by different rules. Everything else
is not. The `scope-drift` control still fails an unowned change at commit time, so this is a hole
in prevention rather than in detection.

**Why the hole matters anyway.** `CLAUDE.md` states that `## Files` is the only declaration of
ownership and that the write guard reads it and nothing else. That is true of one of the two ways
an agent writes a file. The point of a pre-write guard is that the agent is told *before* it does
the work; detection at commit time tells it after, when the work is already done and the
correction is expensive. It also means an agent that is refused at Write can reach the same file
through Bash, which turns a boundary into a formality.

## Proposed outcome

One question about ownership, asked in one place, answered the same way whichever tool asks it.

Observable from outside the system:

- A shell command that writes to a path outside the selected change's `## Files` is refused, and
  the refusal says the same thing the Write tool's refusal says.
- A shell command that writes to a path the approved plan does name proceeds.
- The three historical false blocks this rule has already caused stay allowed: `echo hi
  2>/dev/null`, `harness check --stage stop 2>&1 | tail`, and a commit carrying a
  `Co-Authored-By: ... <noreply@...>` trailer.
- Commands that write the harness's own bookkeeping under `.aidlc/artifacts/` and `.aidlc/state/`
  keep working, so intents and plans can still be written before any plan exists to own them.
- `scope-drift` still fails an unowned committed change, so detection is not traded for
  prevention.

## Affected users and systems

- `.aidlc/lib/guard.mjs` — `bashContractBlocked`, which is the whole of the change in production
  code.
- `.aidlc/hooks/dispatch.mjs` — `preBash` consumes the result and labels the ledger row.
- `test/guard.test.mjs` — holds the false-block cases that must stay green, and has no case today
  where a plan is selected and a bash target is unowned. That absence is why the defect survived.
- Every agent working in this repository, including this session. Commands that work today will
  start being refused. That is the change, not a side effect of it.
- The `a-block-names-its-rule` change, whose approved plan already claims `.aidlc/lib/guard.mjs`,
  `.aidlc/hooks/dispatch.mjs` and `test/guard.test.mjs`. See the open questions.

## Constraints

- **Tightening what happens to a target must not widen what counts as one.** `writeTargets` is
  regex-level by the tree-sitter decision in `docs/BUILD-PLAN.md` Phase 3 and stays that way. This
  change alters the verdict, not the extraction.
- The existing carve-outs survive unchanged: `artifactOrState`, `/dev/` targets, and
  quoted-then-empty targets.
- Zero dependencies. `[limits]` unchanged; no new skill, hook, agent or control. This is a repair
  to an existing control, which is what Law 11 permits.
- A guard is a heuristic workflow control, not a sandbox. Repairing it does not make it one, and
  nothing here should be described as though it did.

## Open questions

Three decisions are consequential enough to belong to the human. Each has a recommended answer,
recorded in the spec rather than left open.

1. **Targets outside the repository.** Today the Write path allows them — `writeRefusal` returns
   `null` for anything resolving above the root — while the bash path, when nothing is approved,
   refuses them, because it never converts an out-of-tree absolute path to a repo-relative one.
   Making the two agree means picking one. The recommendation is to match Write/Edit: a path
   outside the repository is outside the contract's scope and is allowed. This *relaxes* today's
   bash behaviour in the no-selection case, and it is the reason a session can keep using its own
   scratchpad directory. The alternative — refuse out-of-tree writes on both paths — would be a
   new restriction this defect does not justify and would break the Write path for every existing
   caller.

2. **Whether a bash refusal reports which rule produced it.** `writeRefusal` returns a rule name
   (`prefix-cache`, `protected-path`, `test-lock`, `write-scope`); `preBash` currently labels every
   contract refusal `contract-scope`. Passing the real name through would make the ledger able to
   tell these apart, which is the stated purpose of rule ids. The recommendation is to pass it
   through, because the alternative is to route through `writeRefusal` and then discard the one
   piece of information the routing gained. It does change existing ledger rule ids for this
   control.

3. **Ownership of `.aidlc/lib/guard.mjs`.** `a-block-names-its-rule` has an approved plan naming
   guard.mjs, dispatch.mjs and `test/guard.test.mjs`, and `harness status` reports the overlap.
   Parts of it appear already present in the code. The recommendation is to serialize — this
   change is small and lands first — but which change owns those files is the human's decision,
   and the guards yield to it and to nothing else.
