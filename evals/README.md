# Evals

Twenty golden tasks are the Law 9 floor. The suite grows only when a new task measures a
defect the floor missed. `second-req-links-first` is that: a dummy req B against a fixture
where req A already shipped, so the chain has to attach to the existing design instead of
starting over. A `steps` array keeps one workdir across intent → committed approval → spec →
plan → implement; without that, `plan-drift` would still grade B's diff against A's plan.

## Running

```
node evals/run.mjs                 # all tasks
node evals/run.mjs --id surgical-fix
node evals/run.mjs --dry           # validate tasks.json without spending anything
```

Exits 0 with a clear message when no Claude credentials are found (API key **or** a Claude
Code login), so the suite never blocks a contributor who only wants to run `node --test`.

## Design rules

- **The invoker is injected**, so the runner itself is unit-tested with no model in the loop.
- **Every task carries a USD ceiling and a timeout.** A task that cannot be bounded is not a task.
- **The eight highest-signal tasks run three times** and report variance. A 2-of-3 pass is a
  different finding from a 3-of-3 and must not be rounded to "green".
- **Assertions are deterministic.** Transcript regexes are a last resort, not the default.
- **Every production incident becomes a permanent task here.** That is the only growth path.

## CI trigger

Any diff touching `.claude/skills/**`, `.claude/agents/**`, `.claude/hooks/**`,
`.claude/checks/**`, `.claude/lib/**`, or `harness.toml`. That trigger replaces
certification profiles, autonomy tiers and control-budget meta-ratchets.

Product repos: `harness new eval <incident-slug>` writes `.claude/evals/pending/<id>.json`.
Merge that stub into `evals/tasks.json` before treating the incident as closed. The kernel
suite in this checkout is the golden tasks in `evals/tasks.json`.
