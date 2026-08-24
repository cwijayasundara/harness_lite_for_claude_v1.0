# CHANGE-ME

Under 120 lines, enforced by `harness check --stage commit`. Stale content here costs tokens
on every single turn, so delete anything that stops being true.

## AIDLC workflow

The user starts or resumes the workflow in natural language, for example: “Take this request
through the Lean AIDLC workflow” or “Approved. Continue the workflow.” Do not ask the user to
invoke harness commands.

Inspect `.claude/artifacts/` and resume the first incomplete stage:

`intent -> intent approval -> spec -> spec approval -> plan -> plan approval -> implement -> review`

Use the matching `intent`, `spec`, `plan`, `implement`, and `review` skills. Pause to confirm the
intent, then at the three formal human gates: committed spec approval, committed plan approval,
and review/PR merge. Ask focused questions whenever missing information genuinely blocks the
current stage. Invoke the harness internally for artifact creation, status, and verification.

## Agent commands

These are agent and CI implementation details, not commands the user must run.

```
bash .claude/bin/harness check --stage fast --changed   # fmt, lint, types — after every edit
bash .claude/bin/harness check --stage stop             # + tests — before saying "done"
bash .claude/bin/harness doctor                         # which verbs are wired up
```

Never report a task complete without running and pasting the output of `--stage stop` yourself.

## Conventions

- <one line per convention that has actually caused a mistake>

## The artifact chain

Work flows `intent -> spec -> plan -> diff`, all under `.claude/artifacts/`.
`plan.md` names the files it will touch; the diff must match, or the plan is updated in the
same commit. `harness check --stage commit` enforces this.

Three human gates: spec approved, plan approved, PR merged. Nothing else waits for a human.

## Things this project gets wrong

<add a line the second time a mistake happens — never the first>
