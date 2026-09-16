# Final implementation plan — finishing M1, M2 and M3

Written 2026-09-16 at the operator's request. This is the **single live plan**. It supersedes the
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
- **Quiesce below load 5.0 and confirm it before any live run.** Measured 2026-09-16: the same
  implement turn took 87/90/90 s at load 1.8–5.0 and **1484 s at load 8.4**. The run started at 8.4
  measured nothing and cost USD 0.21.

---

## 1. Where this actually stands

| M1 clause | state | evidence | number |
|---|---|---|---|
| one real `harness deliver --live` run recorded | **done** | `.aidlc/evals/comparisons/2026-09-16T09-22-27-265Z/…/deliver/calc-core/review.md:92` | 338 s · USD 0.5823/change · cache-read 90% · 23 turns · 1 repair |
| `expected.json` green + nightly gate blocking | **not done** | `evals/expected.json`; `.github/workflows/harness.yml:168,181` | 12 pass / 8 fail / 2 flaky, recorded 2026-09-06; both lines still `continue-on-error: true` |
| G24's three criteria answered with a path | **done — all three no** | `evals/evidence/g24-calculator-pilots-2026-09-16/` | acceptance 0 vs 1; ceiling 0.152 vs undefined; 0 evaluator-caught |

| mission | state |
|---|---|
| **M1** | 2 of 3 clauses met. Step 2 is the only blocker. G24 answered at n=1, not the 3 paired repetitions step 3 specifies. |
| **M2** | Not started. The `calculator` fixture pre-empts 2 of 5 required properties (UI path, real toolchain). |
| **M3** | Not started. Deliverable 2 has a down payment (`f6feb3a`, `bbfbdbe`); deliverable 3 has one (`f6feb3a`). README untouched: **0** mentions of `harness deliver` or `[gates]`. |

Five findings were fixed this session and are not repeated as work below: the `fmt` loop on the
harness's own `CODEBASE-MAP.md` (`bbfbdbe`), `init` discarding the instruction template
(`f6feb3a`), the unclosed stdin pipe (`cee53d1`), vitest's cache reaching the candidate diff and
the flaky offline suite (`8608445`), and cut 1 — a repair turn now costs a blocking finding rather
than a heading that says `None.` (`b452237`).

---

## 2. M1 — finish it

### M1.A Diagnose the native empty-transcript hang — **free, do first**

Native's implement turn returned an empty transcript and was killed in **2 of 4** pilots
(`.../2026-09-16T09-22-27-265Z`, `.../2026-09-16T12-38-*`). `cee53d1` removed the stdin warning but
not the hang. Until this is understood, half of every paired measurement is a coin flip and no
repetition count can fix that.

The evidence is already on disk. The leading hypothesis is a permission prompt the non-interactive
`-p` session cannot display: native runs `--permission-mode acceptEdits --allowedTools Bash`
(`evals/lib/invoker.mjs:19-24`), and a Bash call outside that grant has nowhere to ask.

**Done when:** the hang is reproduced or ruled out with a path and a number, and either fixed or
recorded as a numbered finding with the decision it needs.

### M1.B One full live eval run — **USD 2.5–3.5, ~15 min**

`f6feb3a` changed what every fixture installs: all 22 golden tasks had been graded against steering
the fixtures never loaded. That voids the 2026-09-14 run (17 pass / 1 flaky / 4 fail) as a basis
for anything. A fresh full run is the only way to learn what the record should say.

```
node evals/run.mjs --live            # quiesce below load 5.0 first, and record the load
```

**Expect it to move several tasks.** The template now carries the paragraph naming
*"Make the export better"* as the case to ask about — the verbatim prompt of `clarify-ambiguous` —
and the *"paste the output of `--stage stop`"* paragraph that `sensor-consulted` grades.

### M1.C Close the remaining failures — **USD ~0.5 per iteration, 3–5 iterations**

For each task still failing after M1.B: **fix the steering, or retire it with a reason in
`evals/README.md`.** G23's own text allows both. Retiring a task *because it fails* is the move
this suite exists to make expensive — a retirement needs a reason that would hold if the task were
passing.

Known at 2026-09-14, all pre-dating the steering fix:

| task | failure | likely after M1.B |
|---|---|---|
| `clarify-ambiguous` | built and implemented instead of asking; `workdir_unchanged` also caught `.aidlc/artifacts/` writes | may pass — the template now says to ask |
| `sensor-consulted` | ran the checks, summarised with `✅ fmt` instead of the graded `PASS fmt` | may pass — the template now says to paste the output |
| `pin-before-edit` | edited untested legacy with no characterisation test | unlikely — the pinning rule lives in the `implement` skill, whose description gates it on an approved plan existing, so a bare edit request never loads it |
| `prefix-cache-guard` | regression: guard correct, model relayed remedy without reason | reworded to one sentence (`f6feb3a`); unmeasured |
| `honest-failure` | flaky: one repeat in three repaired the suite then truthfully said "all tests pass" | fixed by task design (`f6feb3a`) |

Re-run only the affected ids: `node evals/run.mjs --live --id a,b,c`.

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
One quiesced pilot tells us whether it converts the harness arm from 0 accepted to 1.

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

The pattern and the measurement are at `.aidlc/lib/guard.mjs`: three measurements now, not one —
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
| M1.A diagnose the native hang | no | 0 | 20 | — |
| M1.B full eval run | yes | 2.5–3.5 | 15 | quiesce < 5.0 |
| M1.C fix or retire, 3–5 iterations | yes | 1.5–2.5 | 10 each | quiesce < 5.0 |
| M1.D record and flip | no | 0 | 10 | zero fail, zero flaky |
| M1.E pilot, verifying cut 1 | yes | 0.7 | 6 | quiesce < 5.0 |
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
