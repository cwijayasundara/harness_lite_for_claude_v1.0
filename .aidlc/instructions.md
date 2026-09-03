# lean-harness

A harness for Claude Code: guides, sensors, and the ledger that decides which survive.
This repo governs its own development with the harness it ships. There is no self-exemption.

## AIDLC workflow

Users start or resume in natural language: “Take this through the Lean AIDLC workflow” or
“Approved. Continue the workflow.” Inspect `.aidlc/artifacts/` and resume the first incomplete
stage: `intent -> intent acceptance -> delivery contract -> spec seal -> plan seal -> implement
-> evidence -> review`. Invoke harness commands yourself; never make the user drive
the workflow through the CLI.

## Agent commands

```
.aidlc/bin/harness check --stage stop     # secrets + the full unit suite
.aidlc/bin/harness check --stage commit   # + scope-drift, budget, arch, test-quality
.aidlc/bin/harness contract new <slug>    # one versioned design-and-execution artifact
.aidlc/bin/harness contract seal <slug> --scope spec|plan   # the human's approval, digested
.aidlc/bin/harness status                 # contract stage and integrity
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
- **The budget is full**: skills 10/10, agents 3/3, hook bindings 5/5. Adding one means
  deleting one. `--stage commit` enforces this; do not raise a limit to get past it.
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

`intent-ref -> delivery contract -> diff -> evidence -> review`, all under `.aidlc/artifacts/`.
The contract contains observable behaviours, design, exact owned paths, operations, and proof;
`scope-drift` enforces that ownership. Its spec and plan sections are sealed independently, then
the committed artifact governs implementation. The final gate is human PR approval and merge.

Deploy and Maintain are project-owned. The harness ships one example,
`examples/maintain/band-to-intent.mjs`, which turns a control-band breach into an intent.
