# Evals

Twenty golden tasks are the Law 9 floor. The suite grows only when a new task measures a
defect the floor missed. `successor-contract-links-first` proves that a successor contract links
to the shipped design instead of opening an unconnected artifact chain. Contract tasks also cover
owned scope, testability, evidence, and refusal of work outside the approved boundary.

Two isolated product campaigns live in `products.json`, separate from golden tasks. See
`docs/OPERATING.md`, "Automated product campaigns", for boundaries and evidence semantics.

## Running

```
node evals/run.mjs                 # all tasks
node evals/run.mjs --id surgical-fix
node evals/run.mjs --products --max-suite-usd 20 --require-auth  # both product campaigns
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

Any diff touching `.aidlc/skills/**`, `.aidlc/roles/**`, `.aidlc/hooks/**`,
`.aidlc/checks/**`, `.aidlc/lib/**`, or `harness.toml`. That trigger replaces
certification profiles, autonomy tiers and control-budget meta-ratchets.

Product repos: `harness new eval <incident-slug>` writes `.aidlc/evals/pending/<id>.json`.
Merge that stub into `evals/tasks.json` before treating the incident as closed. The kernel
suite in this checkout is the golden tasks in `evals/tasks.json`.


Product trials require the local Docker image built from `evals/Dockerfile` and model credentials
in the environment or gitignored `.env`. The configured capable generator and evaluator run in
separate CLI contexts. `--products --through 1 --id campaign-ledger --max-suite-usd 3` calibrates
one change and explicitly records a partial trial. `HARNESS_PRODUCT_DOCKER=1 node --test
 test/product-trials.test.mjs` exercises isolation and grading with no model calls.
Every attempt retains source snapshots and phase evidence under `.aidlc/evals/products/`, even
when it fails. Those private outputs are not mounted into the agent container.
