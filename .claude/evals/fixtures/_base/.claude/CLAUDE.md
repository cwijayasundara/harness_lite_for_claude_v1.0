# fixture

## Commands

```
bash .claude/bin/harness check --stage fast --changed
bash .claude/bin/harness check --stage stop
```

Never report a task complete without pasting the output of `--stage stop`.

## Conventions

- Source lives in `src/`, tests in `tests/`.
- Work flows intent -> spec -> plan -> diff, all under `.claude/artifacts/`.
- `plan.md` names the files it touches; the diff must match or the plan is updated with it.
