# The prompt, and the thinking behind it

Written 2026-09-15 from a read-only survey of this repository at `phase-2-the-delivery-engine`
(34 commits ahead of `main`, clean tree). Part 1 arranges the idea. Part 2 is the prompt — paste
it whole into a fresh session. Part 3 is how to use it.

---

## Part 1 — Your idea, arranged

### 1.1 The reframe

You already build good code without a harness: planning, `/superpowers`, judgment. The harness is
not for you. **It is the thing that lets someone who is not you ship like you.**

That sentence is the whole shift, and it moves the success metric. For nine months the question has
been *is the harness correct?* — and the repository answers that question very well: 620 tests, a
digest-bound artifact chain, a ledger that can retire its own controls. The question that has never
been asked is *did somebody else ship through it?* There is no eval for it, no metric in
`harness metrics`, no recorded trial. It is the only axis with no instrument.

Everything below serves that reframe.

### 1.2 The SDLC you described, against the code that exists

| Old world | Artifact | Harness stage | What exists today | What is missing |
|---|---|---|---|---|
| BA interviews users | PRD | `intent` | `.claude/harness/skills/intent/` (Opus, high effort); `lib/intake.mjs` reads a PRD or tracker story (G08) | Nothing. This row is done. |
| Break into epics/stories | Jira/Linear board | `spec` | `.claude/harness/skills/spec/`; numbered `### B<n>` behaviours, `supersedes:`/`extends:`, gate 1 | No write-back to a tracker. A story goes in; a SHA does not come out. |
| Architect designs | Confluence | `design` | `.claude/harness/skills/design/` (G16) — Entities, Approach, Structure, Safeguards into `spec.md` | Nothing blocking. Brownfield design reads existing code via the graph. |
| QA writes test cases, plans, data | Excel | — | **Nothing.** `mutation`, `sast`, `layers` verbs exist as declarations and are empty everywhere; `coverage_lines_pct` is `null` in `.claude/harness/baseline.json` | **The genuinely empty row.** No test-plan generation, no test-data generation, no E2E, no Playwright. Your essay names this and the code does not have it. |
| Engineer plans the work | — | `plan` | `.claude/harness/skills/plan/`; `## Files` is the ownership declaration the write guard reads; gate 2 | Nothing. |
| Identify the blast radius | manual review | — | `lib/graph.mjs` — `callers`, `co-edit-hubs`, `changed-since`; plus `checks/scope-drift.mjs` | The capability exists and is never called "blast radius". Its **value is disputed and unresolved** — see 1.4. |
| Engineer implements (TDD) | code + tests | `implement` | `.claude/harness/skills/implement/` (Sonnet, low effort, `context: fork`); PostToolUse exit-2 self-correction | Your essay says TDD is not productive for agents and the skill agrees. Settled. |
| 2–3 peers review the PR | PR comments | `review` | `roles/evaluator.md` (Opus, read-only, fresh context, `git archive` snapshot); `lib/deliver.mjs` repair loop, max 2 | Nothing. This is the strongest part of the harness. |
| CI/CD builds and deploys | pipeline | `deploy` | `templates/consumer-ci.yml` (G17); `lib/release.mjs` release record (G18) | Never exercised by a real app. No deployable workload exists to exercise it. |
| Prod breach loops back | incident | `maintain` | `examples/maintain/band-to-intent.mjs` (G19) | Same — no real signal has ever gone round this loop. |

Two rows are empty for the same reason: **`campaign-ledger` is a headless Node CLI.** A fixture with
no UI and no deployable can never produce a defect that justifies a Playwright sensor or a release
gate. That is not a gap in the harness; it is a gap in the workload. Hence M2.

### 1.3 Your design principles are already law

Six of the seven principles in your essay are already written down in `docs/CONSTITUTION.md`. The
prompt points at them rather than restating them:

| Your principle | Already law |
|---|---|
| Simple, minimalistic, lean | Law 1 (guides and sensors, nothing else), Law 5 (hard budgets enforced by a test) |
| Tokens used very efficiently | Law 5 `[limits]`, plus the ratchet in `lib/baseline.mjs` |
| Quality improves like a ratchet | Law 9 (evals before controls) — currently non-blocking, see 1.4 |
| Fix the framework, not the code it emitted | Law 10 (every control carries its defect), Law 11 (the defect comes from outside this repo) |
| Right-sized code, not a lot of code | Law 6 (capability verbs, empty is `skipped` not `failed`) |
| Good, maintainable, performant code | `.claude/harness/policies/review.md` — review criteria, not law |

Two are **not** written down anywhere:

- **DRY / extract the reusable function** — a review-policy concern. If you want it enforced it
  belongs in `.claude/harness/policies/review.md`, not as a new control.
- **Democratization** — nowhere. Not a law, not a metric, not an eval. This is the omission that
  matters, and M3 closes it.

### 1.4 What the repository actually needs — and it is not more machinery

The completion plan's work order **G01–G26 has landed, except G24.** Delivery engine, `[gates]`
policy modes, coverage ratchet, deploy and maintain edges, plugin-eval layout, nightly loop: all
shipped. What is missing is evidence.

- **`harness deliver` has never run.** `.claude/harness/state/deliver/` does not exist. The driver is
  exercised only by `test/deliver.test.mjs` with fakes. Phase 2's own exit criterion — "one sprint
  delivered end to end with one human action" — is unproven, on the branch named after it.
- **G24 has never run.** No commit builds it. It gates Phase 5 exit and, by the plan's own rule,
  Phase 6 — which was built anyway. `evals/evidence/comparison-summary.json` exists but holds
  `item-4-delivery-evidence`, status *"remaining paid matrix cancelled by user scope change"*. It
  is not the campaign-ledger comparison.
- **The baseline is stale and red.** `evals/expected.json`: recorded 2026-09-06, commit `6aa9a5d8`,
  12 pass / 9 fail / 2 flaky, USD 8.59. A live run on 2026-09-14 scored 17 pass / 5 fail. Both
  nightly steps are `continue-on-error: true` (`.github/workflows/harness.yml:168,181`), so Law 9
  is off and G26's loop has produced zero rows — `evals/experiments.tsv` does not exist.
- **The one finished comparison says native wins.** 35 accepted changes each: native USD 6.355
  ($0.1816 per change), harness USD 8.218 ($0.2348) — **29% dearer at identical acceptance**. The
  graph arm adds 6.6% on top ($0.2521 vs $0.2365) for the same 35.

**Stop doing this:** 70 directories under `.claude/harness/artifacts/`, a 16 MB ledger whose own export path
refuses anything above 32 MB, 5.2k lines across ten `docs/` files with several marked superseded and
the live plan never annotated with what shipped, a ghost `stop-guard` in `HOOK_CONTROLS` whose test
passes by asserting no rows, and consumer-template `[budget]` numbers that govern nothing.

Writing a document is not progress. A control without an outside defect is not progress.

---

## Part 2 — The prompt

```text
You are working in the lean-harness source repository on branch phase-2-the-delivery-engine.

Read docs/CONSTITUTION.md before anything else. Its eleven laws are binding on you, especially
Law 10 (every control carries its defect) and Law 11 (a control's defect comes from outside this
repository). This repo is deliberately self-exempt: .claude/CLAUDE.md forbids activating the
harness workflow on itself. You run the harness against evals/fixtures/ and against the sibling
app in M2 — never against this repo.

There are three missions. They are strictly sequenced. Finish one, report, and STOP. Do not begin
the next until I tell you to. If you find yourself wanting to start M3 first, that is the signal
you are avoiding M1.

=== GROUND TRUTH — established 2026-09-15, do not re-derive it ===

- The work order G01-G26 in docs/COMPLETION-PLAN-2026-09-12.md has all landed EXCEPT G24. The
  plan document was never annotated with what shipped; git log is the only record.
- `harness deliver` has never actually run. .claude/harness/state/deliver/ does not exist. It is tested
  only with fakes in test/deliver.test.mjs and appears in no CI job.
- evals/expected.json: recorded 2026-09-06, commit 6aa9a5d8, 12 pass / 9 fail / 2 flaky,
  USD 8.5939. A live run on 2026-09-14 scored 17 pass / 5 fail. The record is nine days stale.
- .github/workflows/harness.yml lines 168 and 181 are `continue-on-error: true`, commented
  "G23 flips this once expected.json has no fail and no flaky".
- evals/experiments.tsv does not exist, so G26's nightly loop has never produced a row.
- evals/evidence/comparison-summary.json holds `item-4-delivery-evidence`, status "cancelled by
  user scope change". It is NOT the G24 comparison. Do not overwrite it; write G24 somewhere new
  and say where.
- The one finished comparison, at 35 accepted changes each: native USD 6.355 ($0.1816/change),
  harness USD 8.218 ($0.2348/change) — 29% dearer at identical acceptance. Graph arm: $0.2521
  with vs $0.2365 without, same 35 accepted.
- Budget ceilings in .claude/harness/harness.toml [limits]: skills 7 (6 used), agents 3 (3 used),
  hooks 5 (4 used), hook_loc 600, claude_md_lines 120. Enforced by test/budget.test.mjs.
- [gates] is spec=advisory, plan=advisory, merge=human. merge takes no other value.
- Auth is subscription-only. .claude/harness/lib/claude-auth.mjs refuses ANTHROPIC_API_KEY, Bedrock,
  Vertex and Foundry env vars outright.
- MEASURED HAZARD: with Spotlight (mds_stores) and Defender running, machine load reached 12 and
  a third of the suite was silently killed rather than graded. Quiesce the machine before any
  live run and say in your report what the load was.

=== M1 — PROVE THE HARNESS EARNS ITS KEEP ===

Nothing gets added to this harness until it is shown to be worth its cost. Three steps.

1. Run `harness deliver <slug> --live` once, for real, on a fixture. This is Phase 2's own exit
   criterion and it has never been met. Record cost per accepted change, cache-read share and
   wall-clock in the ledger and in the change's review.md. If the driver breaks, that is the most
   valuable finding available to you — fix it and say what broke.

2. Re-record the eval baseline from an actual run: `harness evals gate --update`. Flip the two
   `continue-on-error: true` lines in .github/workflows/harness.yml ONLY when expected.json holds
   zero fail and zero flaky. Marking a task green without a run that says so is the single move
   this whole suite exists to make expensive.

3. Build and run G24. Three paired repetitions on campaign-ledger, harness arm driven by
   `harness deliver`, native arm on plain Claude Code. Acceptance criteria, all three, verbatim
   from the completion plan:
     - acceptance at least equal to native;
     - cost per accepted change at most native plus 10%;
     - at least one evaluator-caught defect per campaign that the native arm shipped.

   If any criterion fails, the mandated response is to CUT, not to explain. The plan says so:
   "the graph decision (freeze or delete) and the gate defaults are revisited". A smaller harness
   that beats native is the goal. A larger one that loses is not.

M1 is done when: one real deliver run is recorded; expected.json is green and the nightly gate is
blocking; G24's three criteria are measured and answered yes or no with a path to the evidence.

STOP AND REPORT.

=== M2 — A SECOND WORKLOAD, SHAPED DIFFERENTLY ===

Law 11: the next control enters only with a defect from building a non-harness application.
campaign-ledger is a headless Node CLI, so the QA and Deploy rows of this SDLC can never earn a
control from it. Keep campaign-ledger. Add one more app, in a sibling repo, three sprints.

Required properties — these are the point, not the domain:
  - a UI path, so an E2E/Playwright defect is possible at all;
  - a real toolchain (TypeScript, a bundler, a linter, a coverage tool), so G12's detection fills
    the fmt/lint/typecheck/coverage verbs that are empty everywhere today and coverage_lines_pct
    stops being null;
  - a deployable artifact, so lib/release.mjs gates something real;
  - a module rename or schema migration in a later sprint, so blast radius is measured, not
    asserted — this is also how the graph's disputed value gets decided;
  - a rule that REVERSES in a later sprint, the way campaign-ledger sprint 3 reverses sprint 1,
    so supersedes: is exercised on a UI path.

Suggestion, if you have no better one — a shift-swap board. Sprint 1: post a shift, list open
shifts. Sprint 2: claim a shift, with the rule "you cannot claim your own", plus a schema change
adding the claimant. Sprint 3: the rule reverses — a manager may claim on another's behalf — and
the store module is renamed. Propose your own if it fits the properties better; say why.

Drive every sprint through `harness deliver`. Record each stumble as a numbered finding with the
transcript location. New controls come ONLY from those findings, and each one carries its `why:`.

M2 is done when: three sprints are delivered by the driver; the capability verbs are filled by
detection and green; every finding is numbered; and you can name which findings justify a new
control and which justify a fix to existing machinery. Adding zero controls is a good outcome.

STOP AND REPORT.

=== M3 — MAKE IT USABLE BY SOMEONE WHO DID NOT BUILD IT ===

This is what the harness is for. It has never been tested. Four deliverables.

1. README.md describes a harness that no longer exists: hard gates, a human relaying every
   command. It never mentions `harness deliver` or `[gates]` modes — the two headline deliverables
   of Phases 1 and 2. Rewrite it for the harness that exists.

2. Survive the first-run cliff. README.md itself says of filling the eight capability verbs:
   "This is the step people skip, and nothing works until it's done." A step documented as the one
   people skip is a design defect, not a documentation defect. Make `harness init` + `harness
   doctor` leave a new project working, or refuse loudly with the exact next command.

3. Every refusal names its remedy. The prefix-cache guard already set the pattern and the
   measurement, at .claude/harness/lib/guard.mjs:95 — "MEASURED 2026-09-14: the reason went last and the
   model dropped it. [...] A model relaying a long refusal keeps the head, so the operative fact
   goes first and the remedy goes last." Apply that to every refusal a newcomer can hit, and
   measure it the same way.

4. The actual test: one observed trial in which a person who did not build this harness ships a
   story through it unaided. Record every place they stalled as a numbered finding. Then add one
   metric to `harness metrics` that measures this axis, so it stops being anecdote.

M3 is done when: a non-author shipped a story, their stumbles are findings, the README matches the
code, and there is a number for onboarding that a future run can compare against.

=== RULES OF ENGAGEMENT ===

- No new control without a defect from outside this repository. Law 11. No exceptions.
- No task marked green without a run that says so.
- Deletion is a valid deliverable and the preferred one. If M1 says the graph does not pay for
  itself, delete it; the code says so in Law 7 — it is a cache with a miss path, never required.
- Annotate docs/COMPLETION-PLAN-2026-09-12.md with what shipped. Do not write a new plan document.
  There are already ten in docs/ and several are marked superseded.
- Every claim in your report carries a path and a number. "Should work" is not evidence.
- If a mission is blocked, finish everything in it that is not blocked, then say precisely what is
  blocked and what decision from me would unblock it.
- Spend: M1 and M2 cost real money. Tell me the estimate before a live run, not after.

=== HOW TO REPORT ===

One table: claim | evidence path | number. Then a short list of what you did NOT do and why.
Then, if M1's criteria failed, your recommended cut list — largest first.
```

---

## Part 3 — How to use it

1. Paste Part 2 whole into a fresh session on `phase-2-the-delivery-engine`. It is self-contained;
   Parts 1 and 3 are for you, not for the model.
2. M1 costs real money and needs a quiet machine. Quit Docker, pause Defender and Spotlight
   indexing, and check `uptime` before starting. The 2026-09-14 finding was that a busy laptop
   does not make the suite slower — it silently turns a third of it into no measurement at all.
3. If the model opens with a plan document, stop it. There are ten in `docs/` already. The first
   real output of M1 is a `harness deliver` run, not prose.
4. If M1's three criteria fail, the honest result is a smaller harness. That is a success. The
   comparison exists precisely so the answer can be no, and the only wrong response is to explain
   the number away. You have a 29% cost gap and identical acceptance on the board today; the
   burden of proof sits with the harness.
5. M3's fourth deliverable needs a real person. Line them up before you start it — it is the one
   thing in this file the model cannot do for you, and it is the thing the whole project is for.
