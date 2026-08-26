# Constitution

Ten laws. Three are mechanically enforced (2, 5, 9) — the rest are review criteria.
When a law and a convenience disagree, the law wins; when a law is wrong, change it here in a
commit of its own, with the evidence that changed your mind.

### Law 1 — Guides and sensors, nothing else
If a component is not steering the agent before it acts, or observing it after, it is not part
of the harness. This deletes lanes, conductors, autonomy tiers and certification profiles on
contact.

### Law 2 — Control flow is a script *(enforced: `test/contracts.test.mjs`)*
Anything that decides what happens next is a CLI with an exit code. Skills describe how to do
one thing well and never sequence phases. A numbered sequence longer than eight steps inside a
SKILL.md is a program written in English; move it to `bin/harness`.

### Law 3 — One registry, everything generated
`harness.toml` is the only hand-edited source of truth. The stage catalogue, the budget test
and the hook behaviour all read from it. If two files can disagree about the same fact, delete
one. Never write a test asserting that two prose files agree.

### Law 4 — The ledger is control #1
`.aidlc/state/ledger.jsonl` exists before the second control does. Every check invocation
appends a row — no sampling, no opt-in telemetry stack, no configuration. A control that
errors is recorded as `errored`, never silently as a pass.

### Law 5 — Hard budgets, enforced by a test *(enforced: `test/budget.test.mjs`)*
≤12 skills · ≤3 agents · ≤5 hook bindings · ≤600 LOC of hook code · ≤120 lines of CLAUDE.md.
The build fails when exceeded. You cannot argue with a red test; you must delete something.
Raising a limit requires a `why:` line and a ledger query showing the existing ones fire.

### Law 6 — Capability verbs, not packs
Language support is eight commands in a TOML table. Adding Rust is eight lines. Any verb left
empty is `skipped`, never `failed`, so coverage grows with the project instead of gating it.

### Law 7 — The graph is a cache with a miss path
It answers five named questions, proven by a test that asks them, and it indexes everything —
dotdirs included, so the harness is visible to itself. When it is stale or absent the agent
falls back to grep and says so. Never a required input.

### Law 8 — One intake decision, then three delivery gates
Intent accepted · spec approved · plan approved · PR merged. Intent acceptance authorizes entry
into delivery; the remaining three are delivery gates. Everything else is advisory. Approval
pauses inside the build loop destroy the parallelism that makes agents worth running; gates
belong at the edges, not in the middle.

### Law 9 — Evals before controls *(enforced: CI)*
Twenty golden tasks with deterministic assertions and per-task budgets exist before skill #13
or hook #6. Every production incident becomes a permanent eval. The suite runs on any diff
touching the harness's own configuration.

### Law 10 — Every control carries its defect
A `why:` naming the incident or eval it prevents. No why, or no firings in 50 sessions with
zero true positives — it goes at the next audit. Record the defect that motivated a control in
the file itself; future readers cannot infer it and will delete the wrong thing.
