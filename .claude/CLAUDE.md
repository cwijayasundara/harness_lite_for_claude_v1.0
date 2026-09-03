<!-- Generated from .aidlc/instructions.md; edit the canonical file and run harness init. -->
# lean-harness

A harness for Claude Code: guides, sensors, and the ledger that decides which survive.
This repo governs its own development with the harness it ships. There is no self-exemption.

## AIDLC workflow

Users start or resume in natural language: “Take this through the Lean AIDLC workflow” or
“Approved. Continue the workflow.” Run `harness status`, then resume the first incomplete stage:

`intent -> spec (gate 1) -> plan (gate 2) -> implement -> review -> merge (gate 3)`

Invoke harness commands yourself; never make the user drive the workflow through the CLI. The
one exception is `approve`, which is theirs to run — the gate is the point.

## Agent commands

```
.aidlc/bin/harness check --stage stop     # secrets + the full unit suite
.aidlc/bin/harness check --stage commit   # + scope-drift, budget, arch, test-quality
.aidlc/bin/harness new <slug>             # intent.md, spec.md, plan.md, review.md
.aidlc/bin/harness approve <slug> spec|plan --by <them>     # the human's gate, digested
.aidlc/bin/harness status                 # where each change is, and whether its approvals hold
.aidlc/bin/harness ledger audit           # which controls earn their place, and which rules misfire
.aidlc/bin/harness ledger flag <rule>     # a fire the guard got wrong
.aidlc/bin/harness graph query <question> # callers, calls, hubs, cycles, changed-since
.aidlc/bin/harness evals gate             # grade the newest full run against evals/expected.json
```

Never report a task complete without running and pasting the output of `--stage stop` yourself.

## Conventions

- **Zero dependencies.** No `node_modules`, ever. The suite must run on a cold clone. If a
  problem seems to need a library, it is the wrong problem — see the tree-sitter decision in
  `docs/BUILD-PLAN.md` Phase 3.
- **The budget is full.** `[limits]` in `.aidlc/harness.toml` states the ceilings and the harness
  sits at them. Adding one means deleting one. `--stage commit` enforces this; do not raise a limit to get past it.
- **Law 11**: a control enters only with a failing eval, or a defect recorded while building a
  non-harness application through the harness. A defect in harness machinery earns a fix, not a
  new control. Both previous attempts grew because the only workload they governed was themselves.
- Control flow goes in `.aidlc/bin/harness`, never into a SKILL.md. A numbered sequence longer than
  eight steps in a skill fails `test/contracts.test.mjs`.
- `.aidlc/harness.toml` is the only hand-edited registry. Claude settings are generated from
  `.aidlc/hooks/policy.json` by `harness init`—never edit them by hand.
- Every control carries a `why:` naming the defect it prevents. No why, no control.
- Tests are `node:test`, zero-dep, and live in `test/`. Fixtures under `evals/fixtures/` are
  write-protected: a fixture edited to make a test pass is a fixture that no longer tests.
- A guard that refuses a path an approved committed contract owns is a gate inside the build
  loop. Ownership is the human's decision; the guards yield to it and to nothing else.

## The artifact chain

One directory per change, `.aidlc/artifacts/<slug>/`:

- `intent.md` — problem, outcome, affected users and systems, constraints, open questions.
- `spec.md` — numbered `### B<n>` behaviours as Given/When/Then, out of scope, safeguards. **Gate 1.**
- `plan.md` — approach, `## Files`, order, and a proof row per behaviour. **Gate 2.**
- `review.md` — written by the `evaluator` agent, findings citing a behaviour id or a review pass.

An approval is frontmatter plus a digest of the body, so editing an approved artifact reports
`stale-approval` rather than silently still reading as approved. `## Files` in the plan is the
only declaration of ownership: `scope-drift` and the write guard read it and nothing else. The
final gate is human PR approval and merge.

## Generator and evaluator

`[models]` names two: the `implement` skill runs on the generator in a forked context, the
`evaluator` agent runs on the evaluator in a worktree it did not write to, with Bash and no Write.
`harness init` renders both from the registry. A changes-requested review returns to `implement`
at most twice, then the human decides.

Deploy and Maintain are project-owned. The harness ships one example,
`examples/maintain/band-to-intent.mjs`, which turns a control-band breach into an intent.
