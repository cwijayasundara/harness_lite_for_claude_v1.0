# CHANGE-ME

Under 120 lines, enforced by `harness check --stage commit`. Stale content here costs tokens
on every single turn, so delete anything that stops being true.

## AIDLC workflow

The user starts or resumes the workflow in natural language, for example: “Take this request
through the Lean AIDLC workflow” or “Approved. Continue the workflow.” Do not ask the user to
invoke harness commands.

Inspect `.aidlc/artifacts/` and resume the first incomplete stage:

`intent -> intent acceptance -> delivery contract -> spec seal -> plan seal -> implement -> evidence -> review`

Use the matching `intent`, `implement`, and `review` skills. Pause to confirm the intent, then at
the formal human gates embedded in the contract: committed spec seal, committed plan seal,
and review/PR merge. Ask focused questions whenever missing information genuinely blocks the
current stage. Invoke the harness internally for artifact creation, status, and verification.

## Agent commands

These are agent and CI implementation details, not commands the user must run.

```
bash .aidlc/bin/harness check --stage fast --changed   # fmt, lint, types — after every edit
bash .aidlc/bin/harness check --stage stop             # + tests — before saying "done"
bash .aidlc/bin/harness doctor                         # which verbs are wired up
bash .aidlc/bin/harness models resolve generate        # pinned model policy for this role
```

Never report a task complete without running and pasting the output of `--stage stop` yourself.

## Conventions

- <one line per convention that has actually caused a mistake>

## The artifact chain

Work flows `intent-ref -> delivery contract -> diff -> evidence -> review` under `.aidlc/artifacts/`.
The contract names observable behaviours, exact owned paths, operations, and proof. The diff must
match that ownership; `harness check --stage commit` enforces this.

Three human gates: spec approved, plan approved, PR merged. Nothing else waits for a human.

## Things this project gets wrong

<add a line the second time a mistake happens — never the first>
