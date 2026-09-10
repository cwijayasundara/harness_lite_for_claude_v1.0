# Improvement plan: dependable engineering with a lean harness

Date: 2026-09-06. Implementation authorized by the user's instruction to save this plan
and start implementation. This records conversation authorization, not a fabricated CLI
approval or a claim that the existing artifact gates have been exercised.

## Outcome and constraints

Help a capable coding model deliver correct, maintainable product changes with concise
guidance, executable feedback, and human-approved intent, design and implementation scope.
Prove the result through automated integration campaigns, not manual product trials.

- Improve this repository; do not build another orchestration framework.
- Add no production skills, agents or hook bindings; do not increase control budgets.
- Repair or remove existing mechanisms before considering new controls.
- Use production-intended capable models for product trials. Cheap models are optional stress
  tests, not the basis for adding controls when they struggle with the workflow.
- Keep tests, expected outcomes and simulated approval authority outside the agent's writable
  environment. A temporary directory alone is not a security boundary.
- Preserve real human approval in product work. Scripted test decisions are labelled simulations.
- Do not modify another agent's pending work or rewrite existing approvals to cover this change.

## 1. Correct existing mechanisms (delivery A, then B)

| Gap | Change | Acceptance evidence |
|---|---|---|
| Sensor errors report success | Existing runner rejects errored configured checks; unused empty capabilities remain explicitly skipped | Real CLI returns nonzero for missing command, malformed structured output and process termination; successful checks still pass |
| Evaluator can modify its subject | Explicit base/candidate revisions, fresh evaluation context, read-only source access; runner saves findings and runs checks | Evaluator receives the intended candidate, cannot alter source/tests, and reports a seeded defect |
| Digests mistaken for human identity | Approval authority outside generator writes; bind plan to spec revision and approval to artifact revision | Missing, rejected, fabricated and stale approvals do not permit implementation |
| Agent self-approval in campaigns | External driver supplies labelled decisions through the ordinary approval path | Actual Claude Code pauses, accepts correction, resumes; no self-approval bypass flags |
| CI conditions and trigger gaps | Supported secret conditions; include executable and canonical steering inputs | Workflow validation, executable path-filter tests, then real CI smoke run |
| Result selection and readiness | Select newest full run correctly; report absolute outcomes separately from regression comparison | Partial run cannot displace full run; historical failures and incomplete runs remain visible |
| Misleading claims | Correct cache guidance and test-presence naming; document heuristic limitations | Tests no longer demand obsolete cache behaviour or confuse test presence with assertion quality |

Required check failure prevents verified completion, not diagnosis. Optional graph failure remains
advisory. Do not turn an absent optional capability into a new mandatory requirement.

## 2. Simplify daily guidance (delivery B)

Keep intent.md (problem/outcome), spec.md (behaviour/design/safeguards), plan.md
(approach/scope/proof), and review findings (defects/evidence/uncertainty).
Use existing skills to encourage system understanding, consequential clarification, existing
patterns, small behavioural slices, reproduction before fixes, runtime verification and honest
reporting. Remove mandatory invented questions, splitting on the word "and", and blanket bans
on legitimate test maintenance. Material design/scope changes return to a human; routine choices
inside the approved boundary do not.

Acceptance: fewer workflow-repair turns and unnecessary questions on the same scenarios, with
unchanged product correctness and preserved approval boundaries.

## 3. Automated product integration trials (delivery C)

Extend evals/run.mjs and evals/lib/{stage,invoker,campaign,assertions}.mjs. Keep test orchestration
outside the production kernel. Do not build another runner or a generic approval service.

The external driver stages a disposable repository, starts actual Claude Code, supplies one
requirement at a time, issues scripted decisions, introduces failures, and independently grades
the product. Private assertions and future requirements are not exposed to the agent. A simulated
approval proves the protocol, not the quality of arbitrary human judgment.

Three layers:

1. Deterministic integration tests run the real CLI, checks and artifact transitions without models.
2. Agent integration tests prove the actual CLI loads the intended plugin and obeys approval flow.
3. Product campaigns evolve the same product across changes and new sessions with model calls.

| Campaign | Product sequence | External verification |
|---|---|---|
| Existing invoicing ledger | Characterize, partial payments, overdue rule reversal, storage refactor, documentation | Public API behaviour, compatibility, regression cases, current product description |
| Small greenfield service | Create, validate, persist, change requirement, reproduce/fix defect, restart | HTTP behaviour, persisted state, error handling, restart and acceptance tests |

Extend the ledger first. Replace transcript praise and test-name assertions with actual behaviour
where possible. Include rejection/correction/approval, stale approval, session restart, missing
tool, seeded review defect and repair, external file rename, superseded requirement, and local
operational failure producing a new intent. Use local disposable deployment only.

Record incomplete executions and preserve reproducible failure evidence. Open-ended architecture
review is supporting model judgment; deterministic product acceptance is the primary evidence.
Both campaigns must run without manual intervention or agent self-approval.

## 4. Compare against capable native Claude Code (delivery D)

Run comparisons sequentially:

1. Native Claude Code with normal project instructions/tools/tests versus the corrected harness,
   holding the capable model constant.
2. Corrected harness with versus without graph assistance.
3. Strong-model implementation versus less expensive generation plus strong independent evaluation.

Record actual model IDs, tool versions, harness/fixture/candidate revisions, outcomes, regressions,
approval violations, retries, unnecessary questions, cost, latency and available token/cache usage.
Include failed, abandoned and budget-exhausted attempts in comparisons. Missing credentials or
models mean unmeasured, never silent substitution. Calibrate bounded spend before repeated runs;
an unaffordable suite is not a useful gate.

One infrastructure smoke run per configuration, then three paired repetitions initially. Small
samples guide decisions; they do not establish universal reliability. Prefer cost per accepted
change over token price. Compare graph retrieval against competent rg plus bounded reads, repair
the deleted-symbol benchmark, and reconcile graph freshness after shell edits, renames and branch
changes. No graph database or custom compiler is planned.

## 5. Prune using product outcomes (delivery D)

Remove or simplify one suspected redundant/friction-producing mechanism in an experimental
configuration, rerun the same campaigns, and compare correctness, recovery, cost and autonomy.
Retain the simpler version when outcomes are equivalent or better. Firing frequency is not
benefit: false blocks are costly, and rarely used approval boundaries can still matter.

First fix the product, guidance, environment or existing mechanism. Consider a new control only
after repeatable product evidence shows it necessary.

## Delivery and verification record

| Delivery | Status | Scope |
|---|---|---|
| A | Complete for item 1 | Honest execution/reporting, hosted CI and explicit read-only evaluator verified |
| B | Implemented and tested | Daily guidance simplified; bounded comparison found no regression, but friction reduction remains unproven |
| C | Implemented and tested | Both live campaigns passed all 11 changes; private API/HTTP acceptance, failure recovery, saved-revision replay and hosted Docker checks passed |
| D | Item 5 validated; item 4 native/graph comparisons complete, generation partial | Native and graph pairs completed; further paid generation comparisons cancelled after the user redirected validation to a minimal two-sprint app, which passed local workflow checks |

First implementation slice: runner aggregation, malformed structured reports, full-run selection,
absolute result reporting and CI conditions/trigger coverage. Files: .aidlc/lib/runner.mjs,
.aidlc/lib/normalize.mjs, .aidlc/lib/eval-gate.mjs, .github/workflows/harness.yml, and their existing
tests. Verification: reproduce failures first, targeted tests, full stop check, and commit-stage
diagnostics. Existing approval records remain untouched; any scope-check mismatch is reported.

No release readiness is claimed until agent integration and product campaigns have run. Mocked
invokers and passing kernel unit tests alone do not establish dependable product delivery.

### First slice implemented, 2026-09-06

- Configured sensor errors now make `check` unsuccessful, participate in fail-fast, and remain
  recorded as errors. `--all` still runs the remaining checks for diagnosis. Unconfigured optional
  capabilities remain skipped. Signal termination is reported as an execution error.
- Structured report parsing failures are findings even when the command exits zero.
- Full-run selection no longer indexes the filtered list with the unfiltered list's length.
- Eval output includes absolute passed/total counts and each non-passing outcome. The existing
  regression gate remains a regression comparison; it is not a new readiness policy.
- CI secret availability is passed through an environment value, and the path filter includes
  the executable, instructions, review policy, adapters, plugin metadata and evaluation fixtures.

Regression tests first produced four failures against the old implementation. The targeted
52-test run then passed. Additional coverage exercises fail-fast after an error, `--all`, optional
capabilities and the workflow's actual grep filter against representative changed paths.

Full verification:

```text
harness check --stage stop
PASS  secrets     83ms
PASS  test        11783ms

harness check --stage commit --all
PASS  secrets     77ms
PASS  test        13431ms
FAIL  scope-drift
PASS  budget      3ms
PASS  tamper      34ms
PASS  arch        29ms
PASS  test_quality 30ms
```

The scope diagnostic still selects the prior `close-the-harness` change. Its approved file list
does not cover this conversation-authorized iteration. That earlier contract and its approvals
were not rewritten, and the check was not bypassed. The changes remain uncommitted. Approval
reconciliation belongs in delivery B before merge; conversation authorization is recorded above.
The pre-existing CODEBASE-MAP.md modification was left untouched.

Not yet verified: live GitHub Actions execution, actual model integration, evaluator isolation,
external approval protocol, or product campaigns. No paid model trials were launched in this slice.

### Correct existing mechanisms implemented, 2026-09-06

This iteration repairs the existing paths without adding skills, roles, hook bindings or control
budgets. Hook dispatch is shorter after removing campaign self-approval and forced continuation.

- `harness review --base <commit> --candidate <commit> --out <file>` resolves both revisions,
  exports the exact candidate/diff, invokes the configured evaluator in a fresh context with
  Read/Grep/Glob only, and saves its findings. Native safe mode disables customizations; strict
  MCP configuration excludes other tool servers. Invalid, failed or empty model output is an
  incomplete review. Runtime checks remain a separate trusted-runner responsibility.
- New plan approvals record `spec_digest`; changing and re-approving the spec invalidates the
  earlier plan. Local digests and `--by` remain audit metadata, not authenticated identity.
- `evals/lib/approvals.mjs` keeps simulated decisions and full-artifact receipts in the parent.
  Campaign steps can reject/approve a named gate, then require both receipts before launching an
  `implement` step. Recomputed local hashes, fabricated identities, stale revisions and absent
  external decisions do not satisfy that driver. Decisions use the ordinary approval function.
- Removed `AIDLC_EVAL`/`AIDLC_UNATTENDED` approval exemptions, self-approval instructions and the
  Stop retry that pushed an agent past an unanswered gate. The invoker strips both legacy flags.
- The existing suite-wide USD flag now reduces each invocation's allowance and reports budget
  exhaustion as incomplete. Missing cost data reserves the whole invocation allowance. This is
  an application budget, not a guarantee about provider billing precision.
- CI now installs the pinned Claude CLI before model tests. The steering filter covers the new
  integration script. Actionlint 1.7.12 validates the workflow; the pinned npm version exists.
- Cache guidance describes instruction reloads accurately. The legacy `test_quality` capability
  is labelled a test-presence heuristic, with its inability to judge assertions made explicit.

Verification: all 254 deterministic tests passed, including failed-campaign receipt/spend reporting; Actionlint passed. Commit-stage
secrets, tests, budget, tamper, architecture and test presence passed. Scope drift still reports
that the older `close-the-harness` plan does not own this iteration. Earlier approvals and the
pre-existing CODEBASE-MAP.md edit are unchanged. This is not a merge-ready claim.

`node evals/agent-mechanisms.mjs` is the opt-in real-Claude integration smoke. It limits planning
to read tools, resumes the same session through rejection/correction, gives implementation tools
only after parent approvals, independently executes product cases, then asks the configured
higher-capability evaluator to find a seeded defect in an explicit candidate. The fixture,
decisions and runtime assertions are supplied by the driver. The first run tested native CLI mechanisms with customizations disabled. The completion pass
below also tests actual plugin loading; neither run replaces end-to-end product campaigns. Its evidence lives under `.aidlc/evals/smoke/`.

Live result: the retry outside the restricted execution sandbox passed all four phases using
Claude Code 2.1.263 and the configured Sonnet/Opus models. The successful native-only run reported $0.1395525 in the prior turn; its per-run JSON was
overwritten by the later actual-plugin run. That earlier figure is conversational history, not
a retained independently inspectable artifact. The retained actual-plugin evidence reports $0.1853427.
The initial sandboxed attempt timed out before any model output and returned no billing data;
its cost is unreported, not assumed free. The seeded faulty candidate was
`5ea34ea710040daf428ea911dd73047cb9baeeed`, reviewed while the checkout remained on
`3bee577543d3c1d753f216d13abc4efd631d3033`. Those are disposable fixture revisions, not this
repository's implementation commits.

### Item 1 acceptance completion

The user's subsequent instruction to complete item 1, merge to main and push authorizes this
iteration's scope and delivery. `.aidlc/artifacts/correct-existing-mechanisms/` records that
conversation authority through the ordinary committed spec/plan approval path. It supersedes
the earlier campaign self-approval exception without rewriting historical approvals.

The final integration pass additionally found and corrected stale plugin wiring: the manifest
referenced a deleted reviewer file, and the adapter projection named obsolete hook handlers.
A regression test checks every declared agent exists and the hooks match their canonical policy.
The live smoke now loads the actual plugin for generator turns and verifies its SessionStart
hook executed, then tests pause, rejection/correction, resumed implementation and independent
read-only evaluation. The evaluator still uses a fresh native safe-mode session.

The actual-plugin smoke passed (evidence in `evals/evidence/smoke/agent-mechanisms.json`). All
commit-stage controls passed, including scope drift. The Python example's CI environment now
installs its test dependencies and requires a successful stop stage before the cost comparison;
token thresholds and historical outcome expectations are unchanged.

Item 1 acceptance is complete. Hosted unit/graph and verified Python cost jobs passed on
[reviewer-corrected implementation 6a1cd15](https://github.com/cwijayasundara/harness_lite_for_claude_v1.0/actions/runs/34047279120).
The first hosted runs exposed missing CLI/history and a Git-metadata snapshot-copy failure;
those defects were fixed and rerun without changing test expectations or token thresholds.
The actual-plugin integration reported $0.1853427 and passed all phases. Detailed outcomes,
including incomplete attempts, are in `.aidlc/artifacts/correct-existing-mechanisms/evidence.md`.
The confirmation review of 6a1cd15 cleared the mechanism corrections and requested two
documentation fixes: cite this newer CI run and distinguish the completed review archive from
the earlier timeout. Both are now corrected against recorded evidence. No further model
approval is claimed; merge is authorized by the user's explicit instruction. Merge completion
is tracked separately from these acceptance results. Hosted model execution is an
explicit workflow-dispatch option and fails without its required API key. This repository has no
API-key secret configured; local live-model evidence is reported separately from hosted tests.
Full ledger/service product campaigns and arbitrary-shell trial isolation remain item 3, not
unfinished item-1 mechanism tests.

## Source rationale

- [Anthropic SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook)
- [OpenAI harness engineering](https://openai.com/index/harness-engineering/)
- [Guides and sensors](https://martinfowler.com/articles/harness-engineering.html)
- [Maintainability sensors](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- [SPDD](https://martinfowler.com/articles/structured-prompt-driven/)
- [Matt Pocock skills](https://github.com/pipedrive/mattpocock-skills)
- [SwarmForge](https://github.com/cwijayasundara/swarm-forge)
- [Devin Fusion](https://cognition.com/blog/devin-fusion)
- [Claude Code documentation](https://code.claude.com/docs/llms.txt)

### Item 2 implementation, 2026-09-06

The user's instruction to complete item 2, test, merge and push authorizes this delivery.
The ordinary spec/plan approval records are under `.aidlc/artifacts/simplify-daily-guidance/`.
Existing skills now encourage relevant system reads, consequential clarification, existing
patterns, small behavioural slices, reproduction, runtime proof and honest reporting.
Intent no longer demands an interview or invented questions, or splits an outcome on "and".
Spec includes consequential design; plan discusses alternatives only when a tradeoff exists.
Legitimate test maintenance is allowed while preserving regression proof, explicit locks and
external evaluation ownership. Material design/scope changes still return to a human.

Templates, canonical instructions, the Claude projection, review guidance and test-failure hints
are consistent with those rules. No skills, roles, hooks or control budgets were added.
Tests using generated template fixtures were updated to fill the revised prompts; their approval
state assertions and placeholder refusal checks remain intact. Full stop and commit checks and
the graph benchmark passed. The live installed-plugin smoke passed, including approval pauses, correction and independent
review. The paired guidance sample passed all boundary and product checks with zero unnecessary
questions/stops in both variants: it demonstrates no regression, not fewer workflow-repair turns.
That empirical reduction criterion remains unproven. Detailed results, original grading, incomplete
attempt and costs are recorded in `.aidlc/artifacts/simplify-daily-guidance/evidence.md`.
Full product campaigns remain item 3.

### Item 3 delivered, 2026-09-06

The existing eval runner now supports `--products`, with separate product scenarios, restricted
Docker mounts and private grading outside the agent and product processes. The driver supplies
one requirement at a time, records explicitly simulated decisions through ordinary committed
approvals, and retains every attempt with source, revisions, phase outputs and billing status.
No production controls, roles, skills or budget limits were added.

Both actual-CLI campaigns passed at `5df1a80`: five ledger changes and six service changes.
The ledger exercised characterization before implementation, rejection/correction, stale approval,
overdue-rule reversal, independent seeded-defect review and repair, storage extraction, external
rename and current documentation. The service exercised HTTP creation/validation, a missing tool,
persistence and restart, the title-limit change with old data, seeded parsing repair, and an
unwritable-storage incident leading to a new intent and HTTP 503 without state corruption.

The full run reported **2 pass, 0 fail, 0 inconclusive**, costing **USD 2.9209**. Two earlier
calibrations failed and remain in the evidence; their reported combined cost was USD 0.5774.
They exposed container Git trust/file visibility and generated-map scope handling. Deterministic
HTTP tests additionally reproduced stale Docker Desktop data reads; fresh source and data mount
identities resolve that issue. All eleven saved product revisions passed public checks and private
acceptance again with verifier `7dbdc44`, including the corrected HTTP isolation.

Seven deterministic Docker tests pass on macOS and GitHub Ubuntu: mount/write boundaries,
private-data exclusion, no-op/faulty product rejection, approval evidence, incomplete-call billing,
cleanup of timed-out public-test containers, and HTTP persistence/rule-change/storage-failure grading. Hosted unit, graph benchmark and cost
checks also passed. Credential preflight fails closed for product trials; missing billing is
unknown, and failed invocations reserve their spend allowance.

Portable results and exact evidence locations are in `evals/evidence/product-summary.json`.
Full private snapshots/transcripts remain in ignored `.aidlc/evals/products/`. These are one
complete run per campaign, not a reliability-rate estimate. Approvals test the scripted protocol;
deployment remains local and disposable. The separate whole-change evaluator timed out twice
(180 and 480 seconds), with no verdict or reported billing. Those reviews remain incomplete,
independently of the successful seeded product review; no whole-change evaluator approval is claimed.


Item 2 delivery: local stop/commit checks, hosted unit/graph/Python checks and the actual-plugin
smoke passed. The code change is delivered under the user's explicit merge/push authorization.
Three independent candidate-review attempts timed out; no candidate-review approval is claimed.
The paired sample found no regression but did not establish the requested friction reduction.
These limitations remain recorded rather than being reported as completed acceptance evidence.

### Item 4 implementation, 2026-09-07

The existing eval CLI now supports `--compare`: native/harness at a constant capable model,
harness with/without supplied graph context, then strong implementation versus economical
generation with strong independent evaluation. Both product campaigns use private grading and
external simulated decisions. Native has ordinary project instructions and normal shell tools
inside the same restricted Docker boundary, with no installed harness or mounted plugin.

The runner records the full schedule, first-change calibration, three paired repetitions by
default, actual model usage, tool versions, fixture/plugin identity, candidate revisions, cost,
latency, retries, approval violations and unclassified metrics. Missing billing is unknown and
reserves the invocation allowance. `--max-suite-minutes` defaults to 30; a stop file permits
gracious abandonment after the current call. The complete 48-campaign matrix is an extended
benchmark, not an automatic merge gate. Private verification/cleanup can finish after the deadline.

Graph freshness now reconciles content and paths after shell edits, deletions, renames and branch
changes. The deleted-symbol benchmark entry was repaired and golden definitions are validated.
Both graph packs and declaration-first bounded rg achieved 10/10 lookup recall: 5,743 versus
3,436 estimated tokens. This lookup sample does not establish comparative product benefit.

Live trials were stopped after the user flagged excessive runtime. The initial restricted-shell
configuration and the later natural-language approval grading failure remain in the evidence.
The final driver verifies unchanged source/approval metadata across planning instead of requiring
a particular word in the response. Failed verification candidates are saved before repair.
**Full comparative acceptance remains incomplete.** Graph/model-strategy product repetitions
are unmeasured; no winner, universal reliability or item 5 pruning is claimed.

Portable evidence is in `evals/evidence/comparison-summary.json`; complete private phases and source
histories remain under ignored `.aidlc/evals/comparisons/`. Total reported spend was **$7.45033505**;
one timeout omitted billing, so total cost is unknown. Reported spend plus reserved allowance
was $8.95033505. Failed, abandoned and unmeasured attempts are retained, not rounded into passes.

Targeted tests, all eleven deterministic Docker tests, the graph benchmark and full commit checks
passed. Hosted unit/graph, Docker and Python cost jobs passed at
[af5ee31](https://github.com/cwijayasundara/harness_lite_for_claude_v1.0/actions/runs/34088585911).
The final wording/deadline fixes receive separate deterministic verification; they are not claimed
as a newly completed paid campaign. Earlier approvals and the pre-existing CODEBASE-MAP.md edit
remain unchanged. Detailed delivery checks are recorded in the change's evidence artifact.


### Item 5 validated, 2026-09-07

The existing eval CLI supports `--prune`: baseline and lean disposable configurations differ only
in the automatic SessionStart budget inventory. Ledger warnings, approval context, graph and
executable controls remain identical. A single arm can be rerun with `--prune-arm`. The validated
command is `node evals/run.mjs --prune --max-suite-usd 9 --max-suite-minutes 40`; these are now the
pruning defaults. Other comparison defaults and production control limits are unchanged.

**The matched experiment is complete; retain the production baseline.** Both configurations
passed all five ledger and six service changes. Each had zero verification failures, unplanned
repair invocations and realized approval violations, with no manual product intervention.

| Full paired campaigns | Baseline | Lean |
|---|---:|---:|
| Accepted product changes | 11 / 11 | 11 / 11 |
| Reported USD | 2.6533 | 2.7860 |
| USD per accepted change | 0.2412 | 0.2533 |
| Campaign latency | 752.4 s | 844.4 s |
| Unplanned repair invocations | 0 | 0 |
| Realized approval violations | 0 | 0 |

The lean arm cost 5.0% more and took 12.2% longer in this sample. Those differences are not a
statistical reliability claim, but they do not justify adopting the simpler banner. Tool denials
also require interpretation: baseline had four denied scratch-reproduction attempts; lean had
a denied help-only `harness approve --help` request. Neither is an actual approval mutation.
Firing counts alone therefore cannot determine which controls earn their place. Unnecessary
questions remain unclassified; no causal autonomy improvement is claimed.

The fresh run passed all four calibrations and four full campaigns, reporting **USD 6.1403661**
in 30 minutes 25 seconds. Earlier attempts remain recorded: unavailable Docker, a calibration
projection above the first USD 8 cap, and a 20-minute run that completed the baseline ledger
and four service changes before an unbilled timeout. Across all attempts, reported spend is
**USD 9.92484655**, and reported plus reserved allowance is **USD 11.42484655**. Actual total
billing remains unknown because of that earlier timeout.

Validation repaired two existing evaluation problems before the fresh matched run. A correct
zero-balance description had been falsely rejected by the documentation phrase heuristic;
its failed candidate and retry cost remain saved, and a regression test protects the correction.
The saved seeded service tests also reproduced a hang after failed assertions leaked servers.
Disposable staged checks and comparison commands now use Node's 10-second test timeout. The
original fixtures, private behavioral assertions and production timeout settings are unchanged.
The original model timeout lacked a tool trace, so the reproduced hang is not claimed as its
conclusively proven cause. Both repairs apply equally to the matched arms.

All twelve deterministic Docker checks passed, including isolation, external approvals,
seeded-defect rejection, HTTP recovery and failure-with-leaked-server reporting. Full local
stop/commit results are recorded in `.aidlc/artifacts/prune-session-inventory/evidence.md`.
The user authorized merging all changes and pushing to main on 2026-09-07. Spec and plan
approvals are committed, and all final commit checks passed; earlier approvals were not rewritten.
No hosted CI or separate whole-change model review is claimed. The existing CODEBASE-MAP.md
edit is unchanged. Portable outcomes are in `evals/evidence/pruning-summary.json`; full phases,
product histories and the captured driver patch are in ignored `.aidlc/evals/comparisons/prune-*`.


### Item 4 closeout and minimal-app validation — 2026-09-08

The native/harness and graph/no-graph experiments completed three paired repetitions on both
products: all four arms accepted 33/33 changes. Harness and graph arms cost more in this small
sample, with one fewer repair each. Retain the existing defaults; no universal winner is claimed.
Generation strategy validation completed two ledger pairs; its third pair and full service trials
remain incomplete/unmeasured. After repeated latency concerns, the user replaced further paid
benchmarking with a bare-minimum app over two sprints. The original full matrix is not marked passed.

A tiny local task-list app passed sprint 1 (add/list) and sprint 2 (complete with regression tests).
The actual installer, approval CLI, write guard, stop and commit checks were exercised without
Docker or new model calls. A seeded bug failed validation and passed after correction. Approvals
were simulated for this deterministic test; independent model review and a real Claude host-hook
session are not claimed. Empty optional capabilities were explicitly skipped.

Portable outcomes, identities, costs and retained failed attempts are in
`evals/evidence/comparison-summary.json`; findings and limitations are recorded in
`.aidlc/artifacts/complete-native-comparisons/evidence.md`.


### Bounded gap follow-up — 2026-09-08

The user authorized one matched pair per gap on a minimal two-sprint task-list app,
with a shared USD 10 / 30-minute ceiling and no automatic repair loops.
Old and current guidance each passed both sprints with zero questions and workflow stops:
a tie, not proof of reduced friction. Strong-model implementation passed both sprints.
Cheaper generation passed both runtime checks and its first independent review; the final
review was refused before invocation because the shared deadline had expired. Therefore,
no complete generation-strategy comparison or cost winner is claimed.

The experiment used tool-free source generation, driver-owned simulated approvals and actual
harness scope/commit checks plus external runtime assertions. It did not run a Claude host-hook
session or use Docker. Driver faults required correcting a macOS path permission check and
extracting one valid JSON fence from surrounding prose. A replay-input mistake also repeated
two calls and started a third before termination. These extra attempts remain recorded.
Reported spend was USD 0.86280005; charged/reserved spend USD 1.66280005 includes the
interrupted call's USD 0.80 allowance, whose actual billing is unknown. The final review made
no call. Details are under `boundedGapFollowup` in `evals/evidence/comparison-summary.json`.
The original empirical gaps remain qualified; no production defaults were changed.


### Consumer scaffold cleanup — 2026-09-08

Fresh scaffolding is verified to create only eight consumer files plus empty artifact/state
directories. Runtime code and provider guides remain in the shared plugin; development history,
evals, reports, examples and credentials are not copied. New-project instructions now describe
the current workflow and commands. The template no longer advertises removed deployment/SLA
configuration. Existing consumer instructions/configuration remain preserved on reinstall.

The maintenance example now creates a discoverable draft at
`.aidlc/artifacts/<slug>/intent.md` and preserves existing triage edits. Curated reports moved
byte-for-byte to `evals/evidence/`; full raw runs remain ignored. Historical approved specs and
plans are unchanged. Four delivered implementation intents were closed; the two incomplete
comparison intents remain open and qualified by their recorded evidence.

Python and TypeScript examples retain their application behavior, with current instructions,
seven-skill inventory and no tracked runtime caches or retired adapter metadata. Legacy Python
artifact records are preserved under `evals/evidence/examples/`. The duplicate TypeScript Node
type dependency declaration now matches the existing lockfile, without changing its
resolved dependency graph. Example token baselines were intentionally recaptured for the
corrected consumer instructions with the same tolerance and successful configured checks.

The plugin-cache resolution test now copies runtime files rather than the entire development
checkout. On this machine its elapsed time fell from about 67 seconds to 0.3 seconds while
retaining its environment/cache resolution assertions. No paid trials were run for this cleanup.

## Lean review, 8 September 2026

Requested by the user to prevent repeating v6's overengineering. Inspected lean revision
`a4118f5` and the sibling v6 checkout at `1d1626f`; also checked the
[public v6 repository](https://github.com/cwijayasundara/claude_harness_eng_v6).
Assessment: substantially smaller than v6, but growing along the same path of accumulating
coordination and evidence machinery. Passing the current budget cannot refute that assessment.

**Measured footprint.** Physical lines, including comments/blanks, from Git-tracked files:

- Lean executable core: 4,890 lines in 29 files. This counts `.aidlc/bin/harness` and `.mjs`
  files under `.aidlc/{lib,checks,hooks,sensors}`; it excludes templates, skills, tests and evidence.
  The identical selection at `3c79375` was 3,689 lines in 24 files: 33% growth.
- v6's `.claude/hooks` and `.claude/scripts` alone contain 40,010 lines across 284 tracked
  JS/TS/Python/Markdown/JSON/TOML/shell files. This is a footprint reference, not an equivalent
  executable-core metric; the older repository also includes optional packs and development tools.
- Lean has 234 tracked Markdown/JSON artifact files containing 50,427 lines, plus a 693-line
  README. Artifact history is not installed into consumers and is not agent context by default;
  it still adds repository maintenance and navigation cost. Do not delete approval history to
  improve a line count.
- The budget measures skills, agents, hook bindings, hook lines and Claude instruction lines.
  CLI/library growth, new metadata schemas and additional workflow concepts sit outside it.

**Product evidence.** In the completed paired batch starting `2026-09-07T16:53:21.298Z` in
[comparison-summary.json](../evals/evidence/comparison-summary.json), native and harness each
passed six campaign attempts and accepted 33 changes. Reported model cost was $6.11 versus
$7.85, respectively (29% higher with the harness); retries were one versus zero, and recorded
latency was slightly lower with the harness. Graph-off and graph-on also each accepted 33 changes,
with costs of $7.94 and $8.48 and retries of one and zero. These are small historical samples,
with simulated approvals; interrupted earlier attempts remain in the evidence. They neither
prove universal equivalence nor validate the subsequent team additions. They do not establish a
Codex comparison. The lookup benchmark used 5,743 graph-pack tokens versus 3,436 for bounded
search/read retrieval, both with full reported recall; comparison against whole-file reads
would overstate the graph's benefit.

**Disposition, in priority order.** Keep existing approval boundaries and product checks while
simplifying within them. Further generalization needs a concrete product need and the smallest
adequate solution; this review does not authorize a rewrite or promise blanket feature removal.

| Area | Next decision |
|---|---|
| Graph, map and context packing | Freeze feature expansion; usage was repaired so the agent queries the index first (graph-first retrieval). Removal still needs a graph-first versus Grep-first product comparison, which does not exist. Building one on 2026-09-09 established why: the existing `graph` pair is not it — `configureComparison` disables the staged plugin's graph for every harness arm, so both its arms ran with no index and differed only by packs pasted into the prompt, which is the advisory packing this row already rejected. The four earlier arms also saturated at 33/33, so those products cannot separate retrieval strategies. A `retrieval` pair and a discriminating product (`evals/fixtures/retrieval-app`, where `format` is exported by two modules) are now built, tested and reachable by name; a default `--compare` run is unchanged. One bounded attempt aborted at calibration for an unrelated defect, spending USD 0.11 and measuring nothing — recorded in `evals/evidence/retrieval-comparison-aborted.json`, and not a tie. The user chose to land the tooling rather than spend again. Consider removal only after someone runs it. |
| Coordination and revision-specific product context | Limited to demonstrated D/E needs. Tracker links and targeted Git reads preferred. Selected-change status shows that slice, not a backlog dashboard. Product query kept; delivery.json and pack-revision not expanded. No scheduler or new assignment authority. |
| Host review and runtime identity | Frozen at the honest surface already shipped. Candidate and pin checks preserved, including the conservative downgrades that refuse a verdict while a branch control is invisible. Host merge policy stays authoritative and is not emulated locally; local JSON, pins, digests and `--by` labels stay unsigned observations. No new assessment state, host verdict field or identity root, and no signing or certification verb. `test/host-evidence.test.mjs` fails if the surface grows, so an addition argues against a recorded limit instead of filling a silence. |
| Skills and roles | Reviewed per skill at `89b5c20`; the assessment and its findings are in `.aidlc/artifacts/skills-earn-their-context/review.md`. Five are specific to this harness, `map` additionally measured; `diagnose` and `change-safely` carried generic prose no record motivated, and it is gone. The review also caught `README.md` naming `pure-refactor`, deleted at `3332615`. A skill now enters only with a failing eval or a defect recorded while building an application through the harness — a capable agent being able to follow a recipe is not that evidence — and the ceiling is not raised to admit one. No pack, bundle, overlay or per-domain marketplace; that is the v6 path. `change-safely` was deleted on 2026-09-09 by `retire-change-safely` on the user's decision. Mapping it sentence by sentence before removal corrected that review's own finding F2: four harness-specific rules had no second home, not one, and all four moved into `implement`; four generic rules had none either and were dropped as the criterion intends. The ceiling was deliberately left at its value, so the place the deletion freed belongs to a consuming project — reversing a clause of `skills-earn-their-context#B4` and of `lean-v2#B3`, both named in `supersedes:`. `test/skills-context.test.mjs` fails if the skill set, the ceiling, the verb surface, the stated limit or any rescued rule moves. |
| Ledger and development evidence | Investigated 2026-09-09 from the rows already held — 8,075 rows over 630 runs from 2026-08-24, 729 of them blocks — and recorded in `.aidlc/artifacts/ledger-evidence-not-reporting/review.md`. Three blocks have ever been called false, all `bash-guard/contract-scope`. An unflagged block is an uninvestigated one, not a true positive: nothing in a row records what the block prevented, and this is local development history, not a product-benefit sample. 54 blocks since rule labelling carried no rule at all, so `harness ledger flag` could not reach them; `a-block-names-its-rule` closed that on 2026-09-09. The tags `scope-drift`, `tamper` and the test control already built now reach the ledger row, and `write-guard` names which of its four refusals fired. Historical rows are not backfilled: a rule invented for a past block would be a guess in evidence. 120 of `bash-guard`'s 128 attributable fires are `init-force`, and every `map-drift` fire is a reminder to run `harness map`. Fire rate measures busyness and a seeded deterrent test proves reachability; neither measures net benefit, and only an `unreliable` control may be deleted on the ledger's own evidence. History is retained and nothing publishes it — no benefit field, threshold, verdict, subcommand or reporting service. `test/ledger-evidence.test.mjs` fails if any of that changes. |

The local ledger audit reported 7,493 rows over 593 runs when this review was written on
2026-09-08, including three `contract-scope` firings flagged false; the ledger row above carries a
later 2026-09-09 snapshot of the same growing file, and the two differ only by that. This mixed
local development history is not a product-benefit sample. Its automated keep recommendations do
not cover most of the implementation growth above.

Changes made in this review: clarified existing constitutional laws 5 and 11, exposed the budget's
limits in the README, and removed obsolete operating guidance about latest-approval selection,
backlog-wide blocking and a hardcoded skill ceiling. No runtime mechanism, dependency, gate or
budget was added.

Removal experiments, as of 2026-09-09. One is validated: the session-inventory pruning pair, both
arms 11/11 with the baseline retained. The graph's is not, and its blocker was never the decision —
it was that no product comparison could run at all. `prepareProductChange` wrote campaign intents
with no `source`/`source_revision` binding and specs with no `## Requirements` table, both required
since decomposition-allocation and requirement-traceability landed; `campaign-ledger` and
`campaign-service` failed identically. Every product comparison recorded above therefore predates
those gates. That is repaired and verified against two staged products with real approval calls and
no model spend, so the remaining removal experiments are runnable rather than merely recommended.

Validation: `git diff --check` passed; `harness check --stage stop` passed secrets (118 ms)
and the full test suite (70,649 ms). No new paid model comparison was run for this review.

## Cost and context control review, 9 September 2026

Requested by the user against the Claude Code cost documentation and Anthropic's "Reducing cost
and improving performance with Claude Platform" guidance. Inspected lean revision `e5bc7fe`.
Assessment: the harness already implements most of that guidance, and one instrument it uses to
prove so is measuring the wrong string.

**Prompt surface.** All 665 lines of agent-facing prompt — `.claude/CLAUDE.md`, six `SKILL.md`,
three roles, `.aidlc/instructions.md`, `.aidlc/policies/review.md` — were scanned against the six
prompting anti-patterns the guidance names. No verification rituals, no emphasis boosters, no
scratchpad scaffolds and no stale few-shot examples were found. Fourteen case-insensitive
`never`/`must` occurrences are bounded scope statements rather than thoroughness boosters, and the
longest numbered sequence is five steps against `test/contracts.test.mjs`'s ceiling of eight. The
14.6% the guidance attributes to removing anti-patterns is therefore not available here. No change
to the prompt surface is proposed.

**Already implemented.** CLAUDE.md is 97 lines with `budget/claude_md_lines` failing the build at
120; workflow instructions live in on-demand skills; `runner.mjs` parses TAP and renders capped
findings instead of raw output; `harness review` runs the evaluator in a separate process with
read-only tools; `--max-budget-usd` bounds every model invocation. These are the documented
recommendations, already mechanised, and none of them is changed by this review.

**Context baseline** (`lean-review-context-baseline`). `.aidlc/lib/baseline.mjs:3` states that
keeping token usage in check only means something if a regression fails a build. Neither half
holds. `capture()` builds a synthetic four-line session context, while `dispatch.mjs` session-start
emits that block plus the map summary, the hubs, contract and current-change lines, and one line
per superseded behaviour — measured on 2026-09-09 at 2,593 characters and roughly 649 estimated
tokens, against a recorded `session_context_tokens` of 52. Twenty-five of the 33 lines are
`superseded:` entries. `baseline` appears in no `[stages]` entry, so no gate grades the ratchet,
and `.aidlc/baseline.json` still carries `wiki_index_tokens`, a key `capture()` no longer returns.
Next decision: measure the payload from the one path that emits it, and put the existing ratchet
behind a gate. Whether the `superseded:` list stays in the payload is a separate decision and is
not taken here.

**Graph retrieval, freeze reversed** (`lean-review-graph-retrieval`). The 8 September row above
froze graph feature expansion pending a comparison that has still not been run. On 2026-09-09 the
user directed the expansion with that position in view: a property graph carrying `import`
(file → file), `call` (function → function) and `co-edit` (file ↔ file, derived from git history)
edges, built by `starter graph → audit + deduplicate → anchor → PageRank`. The freeze clause of
that row is superseded from this date. The row itself is left as written, because what it recorded
was true when it was recorded. Two existing findings ground the work rather than the shape of the
design: `evals/fixtures/retrieval-app` exists because `format` is exported by two modules and the
index returns both as equal candidates, and `graph.mjs:267` already warns in its own source that
the degree-based `hubs` metric "is how a graph looks useful while telling you nothing." The
comparison is sequenced first and narrowed to `retrieval-app` alone under the authorised USD 10
and 40-minute ceiling, so the current index is priced before it is replaced. `pack-bench.mjs`'s
exit criterion is unchanged, and its recorded 5,743-versus-3,436 token result is the figure the
replacement is measured against.

No runtime mechanism, dependency, gate, control or budget was added by this review.

### Context baseline repaired — 2026-09-09

`a-baseline-measures-what-ships` landed at `76b37ebf1200521db6cbd713524f868945ea729f`. The
SessionStart payload is assembled by `.aidlc/lib/session.mjs` and by nothing else; the hook writes
what that function returns and `baseline.mjs`'s `capture()` measures the same string. The
synthetic four-line reconstruction is deleted rather than corrected, and a test fails if a second
assembly reappears in the hook.

`session_context_tokens` moved from 52 to 649. **This is a corrected measurement of an unchanged
payload, not a regression.** The emitted string was verified byte-identical across the extraction —
2,594 characters, 33 lines — before and after. The old figure counted four hand-written lines; the
real payload also carries the map, hubs, contract, current-change and 25 `superseded:` lines.

The recapture also corrected a record stale since 2026-08-24: `claude_md_tokens` 672 to 1,516,
`check_stop_tokens` 12 to 1,888, `pack_tokens_p50` 476 to 1,186, and `wiki_index_tokens` removed —
a key `capture()` had stopped producing. `compare()` now reports such a key instead of ignoring it,
so a file that has drifted from its schema is visible rather than silently graded. That the whole
file was stale is the same defect as the headline one: nothing ran the ratchet, so nothing noticed.

The ratchet is now a control. `.aidlc/checks/baseline.mjs` runs the existing `compare()` and
`[stages] commit` names it, so a rise beyond the recorded 1.10 tolerance fails a build and the
finding carries the metric and both figures. No measurement was invented and no `[limits]` value
moved; `hook_loc` fell from 255 to 212 as a side effect of the extraction.

One collision was found while implementing and is recorded because it constrains future work:
`evals/lib/comparison.mjs` rewrites source **text** to run the session-inventory pruning
experiment, and its anchors were the lines this change moved. It is re-anchored onto
`lib/session.mjs` rather than abandoned, because that pair is the one validated removal experiment
on record and one that cannot be re-run against current code stops being evidence. Any future move
of the payload must move those anchors with it; a stale anchor fails loudly with `source drift`.

Not taken here: whether the `superseded:` list stays in the payload. It is 25 of the 33 lines and
grows without bound. This change makes that cost visible and gated; spending it is a separate
decision.

### The index tracks the source — 2026-09-09

`the-index-tracks-the-source` extends `code-property-graph` with two behaviours that change found
rather than planning.

**The index was 83% its own history.** The audit stage landed by `code-property-graph` made the
composition visible for the first time: of 543 indexed modules, 92 were real source. The other 451
were directories the harness itself writes — 377 recorded comparison runs under
`.aidlc/evals/comparisons/`, 50 agent worktree copies under `.claude/worktrees/`, and 17 recorded
product runs. `[graph] exclude` had never named them. The consequence was not cosmetic: the audit
reported 282 ambiguous symbol names, of which the largest was one `src/ledger.mjs` copied into
sixty run directories, and the PageRank that replaces fan-in counting would have ranked those
copies as the most central files in the repository.

Measured before and after, on this repository:

| | before | after |
|---|---|---|
| modules | 543 | 99 |
| symbols | 1,650 | 593 |
| ambiguous names | 282 | 55 |
| index on disk | 620.1 KB | 173.9 KB |
| full rebuild | 853 ms | 62 ms |

99 rather than 92 because `.aidlc/artifacts/**` reproduction scripts are hand-written source and
stay indexed; only machine-written run directories and worktree copies go. The exclusion lives in
`.aidlc/lib/graph.mjs` rather than in `[graph] exclude`, because a default is a value each project
may edit away and then silently re-index its own test history; a project's own list is unioned
with it, never replaced.

**A commit now invalidates the index.** `fingerprint()` hashed discovered paths and their contents,
so a `git commit` — which moves co-edit weights, since those are derived from history — left the
hash identical, `refresh()` returned `{ skipped: 'clean' }`, and nothing in the freshness loop
could see the drift. The commit id is now part of the fingerprint, degrading to an empty component
where there is no git, no commit or a shallow clone. The rest of the loop was already sound and is
untouched: `refresh()` rebuilds whole rather than patching, so a rank can never lag the modules it
summarises, and a mismatch still makes `load()` return `null`, so a stale index is a miss that
sends the caller to search rather than a confident wrong answer. The 62 ms rebuild is what makes
"rebuild whole, every turn" affordable enough to keep as the strategy.

**A correction to the record above.** The 2026-09-09 context-baseline entry reported
`check_stop_tokens` moving from 12 to 1,888 as part of correcting a stale file. That was wrong.
1,888 was an artifact of capturing while the working tree was dirty: `capture()` runs the `stop`
stage internally, the installed runtime's pinned-content check fails on an uncommitted runtime, and
the resulting failure text is what got measured. Captured on a clean tree the figure is 12, which
is what the 2026-08-24 baseline recorded. The `claude_md_tokens` 672 to 1,516 correction in that
entry stands; `check_stop_tokens` never grew. `graph_modules` 543 to 99 and `graph_symbols` 1,650
to 593 in this entry are a corrected scope, not a regression, and neither metric is in `RATCHETED`.

This also means `check_stop_tokens` is only meaningful when captured on a clean tree — a property
of the metric that was not written down before, and is now.

### Code property graph — 2026-09-10

`code-property-graph` landed the pipeline the user asked for: `starter graph -> audit +
deduplicate -> anchor -> PageRank`, over three named edge types.

`import` (file -> file) and `call` (function -> function) already existed but were implicit, so
nothing could ask for one kind and receive only that kind; they are now emitted explicitly and
additively, and `raw_imports` and `symbols` are untouched. `co-edit` (file <-> file) is new and
derived from history. The audit stage reports what the build could not do — 3 unresolved
path-shaped imports, 364 external specifiers counted rather than listed, 55 ambiguous names, 49
duplicate edges collapsed — where `filter(Boolean)` previously dropped all of it in silence. The
anchor resolves a reference to the definition its call site reaches: on `evals/fixtures/retrieval-app`,
`format` from `src/reporting/summary.mjs` now names that module rather than returning both
definers as equal candidates. Ranking is power iteration, damping 0.85, dangling mass
redistributed uniformly; `.aidlc/lib/pack.mjs` at fan-in 4 now outranks `.aidlc/lib/graph.mjs` at
fan-in 10, because pack is imported by central modules rather than by leaves.

**The benchmark went against it, and that is the number that governs.**
`evals/bench/pack-bench.mjs`, re-run on 2026-09-10 at 100% recall for both arms:

| | recorded 2026-09-08 | 2026-09-10 | change |
|---|---|---|---|
| graph pack tokens | 5,743 | 4,102 | −29% |
| bounded `rg` tokens | 3,436 | 2,044 | −41% |
| ratio | 1.67x | **2.01x** | worse |

The graph got cheaper and the alternative got cheaper faster. Excluding the harness's own output
helped bounded search more than it helped packing, so on the repository's chosen exit criterion
the graph now costs roughly twice bounded `rg` for identical recall, against 1.67 times before.
Packing wins on 2 of the 10 golden terms. The exit criterion at `pack-bench.mjs:6` — "if the
measured saving is not real, the graph gets cut" — is recorded here unretired, unweakened and
unreinterpreted, and this entry is evidence for cutting, not against it.

What the benchmark measures is the token cost of retrieving a symbol whose name you already know.
It does not measure anchoring, which bounded `rg` cannot do — a `format` lookup returns both
definers and the caller picks — nor the co-edit edge, which no text search can see, nor ranking.
That is a statement of scope, not a defence: on what it does measure, the graph loses by 2x, and
no product comparison exists to weigh the rest. The graph-first versus Grep-first comparison
remains unrun, and the decision on 2026-09-09 to proceed without it means this benchmark is the
only comparative evidence this change produced.

Index composition after the change: 101 modules, 600 symbols, 285 import edges, 1,691 call edges,
247 co-edit edges. Co-edit derivation costs ~270 ms warm and is carried forward while HEAD holds
still, so a rebuild is 350 ms on the first build after a commit and ~53 ms within it. `graph.mjs`
ends at 547 of 550, `coedit.mjs` at 80 of 90, `rank.mjs` at 99 of 100 — the last raised from 90 by
the user on 2026-09-09 rather than delete the `why:` comments needed to reach it.

### Independent review, and what it found — 2026-09-10

The evaluator reviewed `the-index-tracks-the-source` read-only over the committed snapshot
(claude-opus-5, USD 1.71) and returned **changes-requested**. Its findings are filed at
`.aidlc/artifacts/the-index-tracks-the-source/review.md`; `the-gate-grades-what-it-can-measure`
repairs them.

**The review found a regression three deterministic gates had passed.** `check_stop_tokens`
measures the size of a *green* stop stage's output — two PASS lines, 12 tokens — and was graded
regardless of whether the stage was green. `capture()` re-runs that stage, and
`harness check --stage commit` runs by construction on an uncommitted tree where it fails, so the
gate reported 1,888 against a recorded 12: a 157x rise that said nothing about the change.
Confirmed by running it. `ENVIRONMENT_SENSITIVE` did not reach it, because its skip fires when
`errored_controls` differ and a control that **fails** is not a control that **errors**.

Every `--stage commit` run recorded on 2026-09-09 and 2026-09-10 passed only because it was run
immediately after a commit. The verification method hid the defect; a reader with no shell found
it from three files.

**A correction to this change's own spec.** Its B1 says `harness check --stage commit` "passes on
a dirty tree when the change is sound". That is not achieved and was not achievable. The
`baseline` control no longer fails on a dirty tree — verified in isolation, verdict `pass` — but
the stage still fails there on the `test` control, because `budget.test.mjs`,
`candidate-scope.test.mjs` and others install the harness into temporary roots and an installed
harness requires a clean committed runtime (`runtime unverified`, `runner.mjs:117-126`). That is
existing designed behaviour, not a defect this change introduced or should remove, and it is why
the workflow is commit-then-verify. What this change actually delivers is narrower than B1's first
sentence: the ratchet no longer adds a *second, spurious* failure on top of it.

**Three safeguards were booked as proven and were not.** The no-git degradation test used
`stage()`, which git-initialises and commits every fixture, so `headCommit()` always succeeded,
the empty-component branch was never reached, and the assertion was true before the change too —
it could not fail. The `refresh()` clause was proven one layer below it at `fingerprint()`. The
`pack` miss path, which is the safeguard stopping 451 removed modules from becoming confident
"not found" answers, had no assertion at all. Each now has one, and each was demonstrated able to
fail by removing the production behaviour and watching it go red — the check that a repair for an
unfailable test is not itself unfailable.

**One latent defect fixed while still latent.** `build(cfg, { only })` bypasses `discover()` and
`walk()`, so the harness-output exclusions were not applied on that path. It has no caller today;
the incremental refresh work is what would give it one, and would have silently re-indexed the 451
modules the exclusions removed.

Two review findings are recorded and deliberately not fixed here: `refresh()` computes
`fingerprint()` twice per invocation, and `HARNESS_OUTPUT` overlaps a list in
`test/install.test.mjs` that additionally names `.aidlc/state` and `.claude/state`. Both are real,
neither is a behavioural defect, and neither file is otherwise touched by this change.

**And a defect in the reviewer itself.** `harness review` hardcodes a 180-second timeout that the
CLI exposes no flag for, while `review_diff_max_bytes` advertises 200 KB diffs as reviewable. No
real review fits: a 17 KB diff timed out, and so did a 165 KB one. On timeout it throws
`review incomplete`, so no partial findings survive and the spend goes unrecorded — the JSON
carrying `total_cost_usd` never arrives. Two runs were paid for and produced nothing. The review
above was obtained by calling the same `review()` with a 900-second timeout. The harness cannot
currently review its own changes through its own command.
