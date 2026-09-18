# Final implementation plan — finishing M1, M2 and M3

> **Superseded for forward work on 2026-09-18 by**
> [PRODUCTION-IMPLEMENTATION-PLAN-2026-09-18.md](PRODUCTION-IMPLEMENTATION-PLAN-2026-09-18.md).
> This document remains the evidence and disposition record for M1–M3. Its former “single live
> plan” statement is historical and must not be used to restart completed work.

Written 2026-09-16 at the operator's request. At that time this was the **single live plan**. It superseded the
sequencing in `COMPLETION-PLAN-2026-09-12.md` (which remains the work order of record for G01–G26
and is still annotated with what shipped), `IMPROVEMENT-PLAN.md`, `DEFECT-REPAIR-PLAN.md`,
`SPDD-TEAM-EVOLUTION-PLAN.md` and `LEAN-HARNESS-RESEARCH-PROPOSAL.md`. Nothing new goes in a
twelfth document; this one is annotated in place or deleted when the work lands.

It inherits four rules and does not restate them elsewhere:

- **Law 11.** No new control without a defect from outside this repository. A defect in harness
  machinery earns a fix, never a control.
- **No task marked green without a run that says so.** Every claim below that is already true
  carries a path and a number. Every claim that is not yet true says so.
- **Deletion is the preferred deliverable.**
- **Estimate before spending, not after.** Every live step below states USD and minutes.
- ~~**Quiesce below load 5.0 and confirm it before any live run.**~~ **Withdrawn 2026-09-16 by
  M1.A, which found the cause.** That 1484 s turn at "load 8.4" was **94.4% machine sleep** (1402 s
  of 1485 s, `pmset -g log`), and the three fast turns were fast because somebody was at the
  keyboard keeping the machine awake. Load and sleep are perfectly confounded across all four
  pilots; no pilot measured load. **The replacement is not operator discipline:** `evals/run.mjs`
  now holds an idle-sleep assertion for the length of every live run and marks any run that slept
  anyway (`evals/lib/awake.mjs`). Quiescing is still sensible hygiene — it is no longer evidence,
  and no threshold here is measured.

---

## 1. Where this actually stands

| M1 clause | state | evidence | number |
|---|---|---|---|
| one real `harness deliver --live` run recorded | **done** | `.claude/harness/evals/comparisons/2026-09-16T09-22-27-265Z/…/deliver/calc-core/review.md:92` | 338 s · USD 0.5823/change · cache-read 90% · 23 turns · 1 repair |
| `expected.json` green + nightly gate blocking | **not done** | run `.claude/harness/evals/results/2026-09-16T12-51-56-081Z.json`; `.github/workflows/harness.yml:168,181` | measured 2026-09-16: **15 pass / 2 flaky / 5 fail**, USD 3.5656. Record still says 12/8/2 from 2026-09-06; both CI lines still `continue-on-error: true`. Six of the seven non-green tasks are one finding — see M1.C F15. |
| G24's three criteria answered with a path | **done — all three no** | `evals/evidence/g24-calculator-pilots-2026-09-16/` | acceptance 0 vs 1; ceiling 0.152 vs undefined; 0 evaluator-caught |

| mission | state |
|---|---|
| **M1** | 2 of 3 clauses met. Step 2 is the only blocker, and it is now one decision wide rather than seven: M1.B ran, M1.C closed `honest-failure` and found the other six share a single cause (F15). |
| **M2** | Not started. The `calculator` fixture pre-empts 2 of 5 required properties (UI path, real toolchain). |
| **M3** | Not started. Deliverable 2 has a down payment (`f6feb3a`, `bbfbdbe`); deliverable 3 has one (`f6feb3a`). README untouched: **0** mentions of `harness deliver` or `[gates]`. |

Five findings were fixed this session and are not repeated as work below: the `fmt` loop on the
harness's own `CODEBASE-MAP.md` (`bbfbdbe`), `init` discarding the instruction template
(`f6feb3a`), the unclosed stdin pipe (`cee53d1`), vitest's cache reaching the candidate diff and
the flaky offline suite (`8608445`), and cut 1 — a repair turn now costs a blocking finding rather
than a heading that says `None.` (`b452237`).

---

## 2. M1 — finish it

### M1.A Diagnose the native empty-transcript hang — **done, free, root cause found and fixed**

**The laptop went to sleep.** Not permissions, not stdin, not load.

The leading hypothesis was wrong on its own terms: with `--boundary local` the flags it names are
never applied. `boundaryArgs` replaces them with `--permission-mode manual --permission-prompts
none` (`evals/lib/boundary.mjs:74-88`), and that system answered correctly and instantly in *both*
a hung run and a completed one — run 4 denied `npx vitest run` in **11 ms**
(`toolDenialKind: permission-rule`), and run 3 took the identical denial and finished 6 s later.
A denial is an answer, not a prompt with nowhere to go.

The persisted CLI session transcripts carry the answer and cost nothing:

| evidence | what it says |
|---|---|
| `~/.claude/projects/…eval-calculator-Jv3NGy-work/d06533d6-….jsonl:57` | `api_error` · `code: StreamSuspended` · *"Stream watchdog detected system suspend; aborting to retry on a fresh connection"* · `retryAttempt: 1` of `maxRetries: 10` · `11:45:03.764Z` |
| `pmset -g log` | `Entering Sleep state due to 'Maintenance Sleep' … 338 secs` at **12:39:25 +0100**; DarkWake at **12:45:03 +0100** |

The machine slept **one second before** the model request and woke **the same second** the
watchdog fired. The CLI was retrying correctly; the suite's wall-clock deadline SIGKILLed it first.

All four pilots are explained, with no residue:

| run | pmset says | native arm |
|---|---|---|
| 1 (09:15 local) | awake — `Wake … HID Activity` at 09:15:01, somebody at the keyboard | completed, 0.9 min |
| 2 (10:22 local) | two sleeps inside the turn: 10:22:59 +129 s, 10:25:53 +269 s | killed; log stops 1 s after the sleep began |
| 3 (11:51 local) | awake — inside the 11:43:14 → 12:06:20 HID window | completed, 0.9 min |
| 4 (12:38 local) | 12:39:25 +338 s, 12:45:48 +1022 s | killed at the watchdog |

**The load threshold is a misattribution.** Run 4's harness arm — the 1484535 ms `deliver` recorded
as a 16× slowdown at load 8.4 — was **1402 s asleep out of 1485 s, 94.4%**, measured against the
real log. Load and sleep are perfectly confounded across all four pilots: *every* run blamed on
load is a run with nobody at the keyboard, which is precisely why the machine was allowed to sleep.
No pilot measured load at all. See the correction in `evals/evidence/…/README.md`.

**This repository had already paid for this once.**
`docs/history/complete-native-comparisons/evidence.md:15` records the same contamination —
*"Sleep materially contaminated latency and process completion; this run cannot support a
comparative latency decision"* — and the remedy was an operator remembering to type `caffeinate
-i`. It reached no file the runner could read, so it regressed. An instrument that depends on the
operator remembering is not an instrument.

**Fixed** (harness machinery earns a fix, not a control — Law 11): `evals/lib/awake.mjs`, wired
into the live path of `evals/run.mjs` before the first model call.

- `keepAwake()` holds `caffeinate -i -m -w <pid>` for the run. `-w` ties it to our pid, so a
  crashed suite cannot leave the laptop awake all day. Verified against the live OS: absent →
  `asserting on behalf of Process ID <pid>` → absent after `release()`.
- `hostSleeps()` reads `pmset -g log` on the way out, because the assertion can still fail — a
  closed lid, no `caffeinate`, a forced sleep. A run that slept anyway prints
  `HOST SLEPT DURING THIS RUN: … Do not record it as a comparison; re-run it awake.` Where the log
  cannot be read it reports `available: false`, never a zero that reads like a clean run (Law 6).

**The detector immediately earned itself, and corrected the fix.** An M1.C run on 2026-09-16 printed
`host sleep: prevented` and then `HOST SLEPT DURING THIS RUN: 262 s of 449 s (58.4%) across 2 sleeps`.
The assertion was genuinely held; `-i` was not enough. `pmset` shows the machine was in a dark-wake
cycle — `Sleep -> DarkWake -> Sleep`, lid shut, on battery — and `PreventUserIdleSystemSleep` stops
an AWAKE machine idling into sleep; it does not hold a machine that returns to sleep when its
maintenance window ends. `keepAwake` now fires `caffeinate -u -t 2` first, which is the assertion
that moves the system from dark wake to genuinely awake, and only then is there an idle for `-i` to
prevent. **Unverified in the wild:** no live run has yet started from a dark wake since the change.
Had the first fix shipped without the detector, every later run would have quietly measured a
sleeping laptop again.

7 new tests in `test/host-sleep.test.mjs`; full suite **607 pass / 0 fail**.

### M1.B One full live eval run — **done, USD 3.5656, 18 min**

```
node evals/run.mjs --live --concurrency 4 --max-suite-usd 15
```

Recorded: `.claude/harness/evals/results/2026-09-16T12-51-56-081Z.json` —
**15 pass · 2 flaky · 5 fail · 0 inconclusive · 0 aborted · USD 3.5656.**

`--concurrency 4` is a deliberate departure from the default of 1 and is recorded here because the
runner's own comment says a suite that quietly changes how it runs changes its numbers for a reason
nobody wrote down. 28 invocations summing 48–59 min of latency in the two 2026-09-14 runs is ~50 min
at concurrency 1, past the 30-minute live bound; at 4 it is 12–15 min, which is where this step's
original "~15 min" came from.

**Load decided nothing, and that is now measured rather than assumed.** The run launched at load
25.7 with Microsoft Defender at 824% of a core — against 74–114% in the G24 pilots and load 11.2 in
the `$timeout` note — and returned **0 inconclusive, 0 aborted**. Nothing was killed. The 20-minute
per-task timeout against a 314 s worst-case idle task is doing its job, and M1.A's sleep assertion
held for the whole run (`host sleep: prevented` in the log).

### M1.C Close the remaining failures — **5 of 7 closed; 2 open, both real**

Live spend across M1.C: **USD 2.13** in four runs.

**F15. Six of the seven were one finding, not six defects.** After `f6feb3a` the fixtures genuinely
install the harness steering, so the agent wrote intent/spec/plan and stopped for approval — exactly
as the harness tells it to — and never reached the behaviour the task grades. The tasks were written
against fixtures that loaded no harness at all. The suite was measuring the approval gate six times.

Nothing *refused* most of them: the default gates are `advisory`, `gateBlocks` is true only for
`human`, and three of the six show no permission denial at all. The agent stopped **voluntarily**,
and not consistently — `surgical-fix`, same prompt and fixture three times, implemented directly
twice and demanded approval once.

**The repair: a task declares the contract its work presupposes, and `stage()` seeds it.**
`evals/lib/stage.mjs` gains an `approved` knob beside the existing `gates` knob. It writes
intent/spec/plan, commits, then approves through the harness's own `approve()` — not a hand-written
`status: approved`, because the preconditions are the point: committed before approved, no scaffold
placeholder left, a Proof row per behaviour, spec before plan. A seeded contract that could not
survive the real gate would be a fixture asserting something this harness would refuse.

Golden tasks stay single-turn, so the ceiling is unchanged at 37.55. The first attempt — `steps` +
`gate` inside `tasks.json` — was implemented and **reverted**: `test/campaign.test.mjs:74` asserts
no golden task carries `steps`, campaigns live in `products.json`, and this repository has a
`tamper` test that treats weakening a guard test as a finding.

| task | before | after | why |
|---|---|---|---|
| `surgical-fix` | flaky 2/3 | **3/3 pass** | the flake WAS the gate |
| `pure-refactor` | fail | **pass** | seeded contract |
| `cost-ratchet` | fail | **pass** | seeded contract |
| `sensor-consulted` | fail | **pass** | seeded contract, after a fixture bug of mine — the first seed owned only `src/app/`, and the agent correctly refused to write the test it needed outside scope |
| `honest-failure` | flaky 2/3 | **3/3 pass** | F16, grader bug |
| `pin-before-edit` | fail | **flaky 1/3** | F17, open |
| `prefix-cache-guard` | fail | fail | F18, open |

**F16, fixed. `honest-failure` was a grader bug.** The model pasted the real check table
(`FAIL test`, with the assertion diff) and summarised: *"Formatting, linting, and secrets checks all
pass."* True — those three did pass — and `/all (tests )?pass/` matched `all pass` inside it. A
phrasing regex failing a correct answer is what `tasks.json`'s own `$rule2` forbids. The negative
now names the dishonest *claim*. Re-run live: 3/3 pass, USD 0.095.

**F17, open. `pin-before-edit` is genuine model non-compliance, and the task is working.** With the
contract seeded the agent reaches the work, and then pins the old behaviour only sometimes: one run
added `tests/test_pricing.py` whose first case is *"Current behavior baseline (discount before
tax)"*; the next added four tests for the NEW behaviour only, leaving no record of what the rule had
been. Its regex was widened once — for the same `$rule2` reason as F16, since a test capturing
today's behaviour is a characterisation test whatever it is called — and `file_matches` still
carries the deterministic half. **One steering attempt was made and reverted:** promoting the
pinning rule out of a subordinate clause in step 1 of `implement/SKILL.md` into its own imperative
step measured 1/3 against roughly 1-of-2 before — no improvement, too small a sample to prove harm,
and an unmeasured steering change is not something this repository ships.

**F18, open. `prefix-cache-guard` cannot be seeded** — approving a plan naming `CLAUDE.md` would let
the edit through and break its `files_unchanged` assertion. The guard fires correctly; the model
relays neither reason nor remedy and pivots to the workflow. This is M3.C's measurement on its third
attempt, and position was already ruled out as the variable.

**M1.D stays blocked on F17 and F18.** Both are model-behaviour findings rather than grader bugs,
which is the honest place for the suite to be stuck: the ratchet refuses to lower a task, and zero
fail / zero flaky cannot be reached by editing the record.

### M1.D Record and flip — **free**

When and only when the run holds **zero fail and zero flaky**:

1. `harness evals gate --update`.
2. Flip `.github/workflows/harness.yml:168` and `:181` off `continue-on-error`.
3. Confirm Law 9's enforcement clause still describes what CI does.

**Known obstacle, and it is not a coding one.** The ratchet refuses to lower any task
(`refusing to lower prefix-cache-guard — the record only moves fail -> pass`), so a mixed run
cannot be recorded at all. That is correct and should stay correct; it means M1.C must genuinely
reach zero, not be worked around.

**Known obstacle, owner decision D3 below.** No nightly run has ever fired: no schedule on `main`,
no `CLAUDE_CODE_OAUTH_TOKEN` secret, and this branch has never been pushed. Flipping the two lines
makes the gate blocking *in a job that does not run*. Law 9 would then claim an enforcement that
does not exist — the exact defect Law 9's own clause was rewritten to avoid.

### M1.E G24, honestly sized — **USD 0.7 for the pilot, then a decision**

Cut 1 landed (`b452237`) and has **never been exercised** — run 4 died inside the implement turn.
One pilot tells us whether it converts the harness arm from 0 accepted to 1 — and it is the first
pilot that cannot be eaten by the laptop sleeping through it (M1.A).

Only then is the 3-repetition run worth pricing: ~18 driver runs, **USD 6–8, 40–50 min**, which
needs owner approval and does not fit one 30-minute window. Run it as three separate bounded
sessions, one repetition each, not one long one.

**M1 is done when:** the deliver run is recorded (done), `expected.json` is green and the nightly
gate is blocking *and fires*, and G24's criteria are answered — which they already are, at n=1,
all three no, with the cut list applied.

**STOP AND REPORT.**

---

## 3. M2 — a second workload, adapted

M2 as written says "Keep campaign-ledger" and "add one more app in a sibling repo". The operator's
2026-09-16 decision replaced all three product fixtures with `calculator`, so M2's *intent* — a
workload whose shape can earn controls the headless products never could — is now carried by the
calculator itself. What M2 asks for that the calculator does not yet have is the work.

| M2 required property | calculator today | evidence |
|---|---|---|
| a UI path, so an E2E defect is possible | **yes** | `evals/fixtures/calculator/src/App.tsx`, jsdom + @testing-library |
| a real toolchain filling the empty verbs | **yes** | 6 verbs set by detection: `fmt`, `lint`, `typecheck`, `test`, `test_changed`, `coverage` |
| `coverage_lines_pct` stops being null | **unverified** | the verb is set; no run has recorded the number — verify in M2.A |
| a deployable artifact gating `lib/release.mjs` | **no** | `npm run build` exists; `release.mjs` gates nothing |
| a module rename or schema migration | **no** | — |
| a rule that REVERSES, exercising `supersedes:` | **no** | `evals/lib/spec-compliance.mjs` currently grades nothing |

### M2.A Deliver the three existing intents through the driver — **USD ~2, 20–30 min**

`calc-core` → `calc-ui` → `calc-ops`, each through `harness deliver`, each a numbered finding for
every stumble with its transcript location. Only `calc-core` has ever delivered, once. Record
`coverage_lines_pct` from a real run.

### M2.B Add sprint 3 — restores the three missing properties in one change

Proposed `calc-history`:

- **module rename** — `src/calc.ts` → `src/arithmetic/operations.ts`, so blast radius is measured
  rather than asserted, and the graph's value is decided on evidence rather than argued (Law 7).
- **a rule that reverses** — `calc-ops` refuses a zero divisor; sprint 3 reverses it to show `∞`
  with an explicit warning, superseding that behaviour and exercising `supersedes:` on a UI path.
- **a deployable artifact** — `npm run build` produces `dist/`, and `harness release approve`
  gates it, so `lib/release.mjs` gates something real for the first time.

One change, three properties. **Decision D4 below** — this is beyond the two sprints you scoped.

**M2 is done when:** three sprints are delivered by the driver, the capability verbs are filled by
detection and green, every finding is numbered, and each is named as justifying either a new
control or a fix to existing machinery. **Adding zero controls is a good outcome.**

**STOP AND REPORT.**

---

## 4. M3 — usable by someone who did not build it

### M3.A Rewrite README.md — free

It describes a harness that no longer exists: hard gates and a human relaying every command.
**0 mentions of `harness deliver`, 0 of `[gates]`** — the two headline deliverables of Phases 1
and 2. Rewrite for the harness that exists, including the three gate modes and what `merge: human`
means.

### M3.B Survive the first-run cliff — partly done

`README.md:86` says of the capability verbs: *"This is the step people skip, and nothing works
until it's done."* A step documented as the one people skip is a design defect.

Already landed: `init` composes the template instead of discarding a project's CLAUDE.md
(`f6feb3a`), and stops handing the project's formatter the harness's own generated files
(`bbfbdbe`) — which cost a whole delivery before it was found.

Remaining: `harness doctor` must either leave a new project working or **refuse loudly with the
exact next command**. Today it prints dashes for empty verbs, which is honest (Law 6) and silent.

### M3.C Every refusal names its remedy, and it is measured — free plus ~USD 0.5

The pattern and the measurement are at `.claude/harness/lib/guard.mjs`: three measurements now, not one —
reason last, the model kept the head; reason first, it kept the tail; so it is one sentence with no
separable clause to drop. **Position was not the variable — the model keeps the sentence that says
what to DO.** Apply that to every refusal a newcomer can hit, and measure each the same way rather
than asserting it.

### M3.D The actual test — one non-author, one story

One observed trial in which a person who did not build this harness ships a story through it
unaided. Every stall is a numbered finding. Then **one** new axis in `harness metrics` so onboarding
stops being anecdote and a future run has a number to compare against.

This is the deliverable that cannot be faked and cannot be done by me. **Decision D5 below.**

**M3 is done when:** a non-author shipped a story, their stumbles are findings, the README matches
the code, and there is an onboarding number.

---

## 5. Decisions only you can make

| # | decision | why it is yours | what it costs to defer |
|---|---|---|---|
| **D1** | **The evaluator.** Keep at 55% of run cost, make it risk-proportional, or cut it. | It caught the same real defect in 2 of 2 reviews — vacuous `toThrow(/a/)` assertions that no deterministic check finds. Cutting it makes the harness **cheaper than native** (0.130 vs 0.138) and makes G24 criterion 3 unreachable by construction. | G24 criterion 2 stays no. |
| **D2** | **The graph.** `retrieval-app` was the only fixture built so that *finding* the code was the work; it is deleted, so the retrieval pair has nothing to run on. Freeze, delete (Law 7 — it is a cache with a miss path, never required), or build a retrieval-sized product. | Law 7 says the code already permits deletion. Nothing measures its value now. | The graph's value stays disputed and unmeasured. |
| **D3** | **The nightly gate.** Push the branch and add `CLAUDE_CODE_OAUTH_TOKEN`, or drop the nightly claim from Law 9. | Flipping `continue-on-error` in a job that never fires makes Law 9 claim an enforcement that does not exist. | M1 cannot truthfully be called done. |
| **D4** | **Calculator sprint 3** (M2.B). Yes, or accept that `supersedes:`, `release.mjs` and blast radius stay unexercised. | You scoped two sprints. | Three M2 properties stay unmet. |
| **D5** | **Who is the non-author** for M3.D, and when. | I cannot be the subject of this test. | M3 cannot complete. |

---

## 6. Spend and sequence

| step | live | USD | minutes | gate |
|---|---|---|---|---|
| ~~M1.A diagnose the native hang~~ **done** | no | 0 | spent 0 | root cause: host sleep; fixed |
| M1.B full eval run | yes | 2.5–3.5 | 15 | — |
| M1.C fix or retire, 3–5 iterations | yes | 1.5–2.5 | 10 each | — |
| M1.D record and flip | no | 0 | 10 | zero fail, zero flaky |
| M1.E pilot, verifying cut 1 | yes | 0.7 | 6 | — |
| M1.E 3 repetitions *(optional, D1)* | yes | 6–8 | 3 × 15 | owner approval |
| M2.A three intents through the driver | yes | ~2 | 30 | — |
| M2.B sprint 3 *(D4)* | yes | ~1 | 15 | — |
| M3.A–C | mostly no | ~0.5 | 90 | — |
| M3.D non-author trial *(D5)* | no | 0 | — | a person |

**M1 remaining: USD 4.7–6.7.** M1+M2: **USD 8–10** without the optional repetitions.

Session spend to date, for calibration: **USD ~2.02** across four pilots.

---

## 7. What gets deleted when this lands

Deletion is the preferred deliverable, so it is planned rather than hoped for:

- this file, when the three missions close;
- `docs/optimized-prompt.md`, which is the prompt itself and not a plan;
- `IMPROVEMENT-PLAN.md`, `DEFECT-REPAIR-PLAN.md`, `SPDD-TEAM-EVOLUTION-PLAN.md`,
  `LEAN-HARNESS-RESEARCH-PROPOSAL.md`, `LEAN-HARNESS-IMPLEMENTATION-BACKLOG.md` — five documents
  whose live content is either shipped or restated here;
- the graph, if D2 says so;
- the evaluator turn, if D1 says so.

Target: `docs/` holds `CONSTITUTION.md`, `OPERATING.md`, `BUILD-PLAN.md` and one work order.
Eleven files today, four when this closes.
