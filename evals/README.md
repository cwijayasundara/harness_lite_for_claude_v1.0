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

The default golden suite exits 0 with a clear skip message when no Claude credentials are found
(API key **or** a Claude Code login). Product trials fail closed without an environment key or
token, including when `--force` is supplied: the isolated container cannot use a host keychain.

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

## Native, graph and model comparisons

```
node evals/run.mjs --compare --max-suite-usd 40
```

This extends the existing runner. It runs these experiments **sequentially**, using both products:

1. Native Claude Code versus the harness, both using `[models].generator`.
2. The harness without versus with fresh bounded graph context, using that same generator.
3. `[models].evaluator` implementing directly versus `[models].evals` implementing with fresh,
   read-only `[models].evaluator` evaluation of each candidate and bounded repair feedback.

Each experiment starts with a first-change infrastructure smoke for each arm and product. Known
smoke spend per model call is scaled to the campaign's planned calls and multiplied by two before
starting three paired repetitions. Arm order alternates between repetitions. The suite cap includes
smokes, failures and repairs; missing billing reserves the entire invocation allowance. Calibration
failure, missing credentials/isolation and insufficient remaining budget produce explicit unmeasured
records for the scheduled repetitions. Provider/model errors remain incomplete, with no fallback.
The CLI exits nonzero if any scheduled attempt is failed, incomplete or unmeasured.

Native staging installs no harness and mounts no plugin. Its ordinary `CLAUDE.md` describes the
project workflow, test command and compatibility expectations. Both arms can use Read/Grep/Glob,
Write/Edit and normal Bash access, including `rg`, bounded reads, local runtime probes and process cleanup. Planning source and Git metadata are read-only;
implementation cannot alter Git or harness approval artifacts. The driver owns simulated decisions,
private acceptance and commits. These are isolated, unattended Claude Code trials, not unrestricted
interactive desktop sessions. Native approval is an explicit conversational driver decision; harness
approval additionally uses the ordinary artifact/receipt protocol. Consequential questions remain
possible; the driver does not invent answers outside the scenario.

For the graph experiment, both disposable harness plugin copies suppress automatic cached maps.
The graph arm gets fresh source packs (up to 1,200 estimated tokens per affected source file) in its
implementation prompt; both arms retain `rg` and bounded reads. This measures supplied retrieval
assistance, not whether an agent voluntarily chooses graph tools. The copied plugin is experimental;
production configuration and controls remain unchanged. `node evals/bench/pack-bench.mjs` separately
compares graph packs against declaration-first `rg` results with bounded reads under the same 1,200-token
budget. Historical whole-file totals are context, not evidence that graph assistance earns its cost.
Both visible search hits and source reads count toward the budget. Golden entries must identify a real source symbol, so deleted symbols cannot silently count as hits.

Every invocation and attempt is saved under `.aidlc/evals/comparisons/<timestamp>/`, including a
started record before a call, requested and actual model usage (including CLI auxiliary models),
tool versions, harness/scenario/fixture/candidate identity, latency, token/cache usage when supplied,
public/private verification, retries and external decisions. Full transcripts and product Git histories
remain local private evidence. The comparison summary groups smoke and paired results separately
and computes cost per accepted change using **all** attempts' spend. Unknown billing yields unknown
cost per accepted change. Unnecessary-question counts are null until independently classified;
transcript punctuation is not a valid proxy. Three repetitions inform a decision, not a general
reliability estimate. The comparison does not implement item 5 pruning.

`economics` combines smoke and paired spend per configuration; `summary` keeps the two kinds
separate. Failed verification attempts are counted separately from confirmed regressions: if
a failure has not been classified as new behaviour versus a regression, the regression count is
unknown. Original public/private failure evidence remains available for classification.

To abandon a running suite without interrupting billing collection, pass `--stop-file /tmp/stop-comparison`
and create that file when needed. The driver finishes its current call and records remaining attempts
as unmeasured. The full schedule is persisted before the first call, so unexpected termination also
leaves pending attempts visible. Do not reuse an existing stop file for a new run.
