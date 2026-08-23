# CHANGE-ME

Under 120 lines, enforced by `harness check --stage commit`. Stale content here costs tokens
on every single turn, so delete anything that stops being true.

## Commands

```
bash .claude/bin/harness check --stage fast --changed   # fmt, lint, types — after every edit
bash .claude/bin/harness check --stage stop             # + tests — before saying "done"
bash .claude/bin/harness doctor                         # which verbs are wired up
```

Never report a task complete without pasting the output of `--stage stop`.

## Conventions

- <one line per convention that has actually caused a mistake>

## The artifact chain

Work flows `intent -> spec -> plan -> diff`, all under `.claude/artifacts/`.
`plan.md` names the files it will touch; the diff must match, or the plan is updated in the
same commit. `harness check --stage commit` enforces this.

Three human gates: spec approved, plan approved, PR merged. Nothing else waits for a human.

## Things this project gets wrong

<add a line the second time a mistake happens — never the first>
