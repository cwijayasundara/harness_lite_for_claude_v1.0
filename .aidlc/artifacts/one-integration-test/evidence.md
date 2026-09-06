# Evidence: one-integration-test

## Run 1 — 2026-09-06, commit `2989f31`, results `2026-09-06T06-24-12-841Z.json`

`node evals/run.mjs --id campaign-ledger --require-auth`, model `claude-haiku-4-5-20251001`,
unattended. **Fail at sprint 3 of 5.** $0.55, 6 minutes 37 seconds wall clock.

| sprint | verdict | notes |
|---|---|---|
| 1 adopt | **pass**, 8 of 8 | characterised before editing; `src/fees.mjs` untouched; own spec and plan, self-approved |
| 2 extend | **pass**, 5 of 5 | sprint 1's tests edited, not replaced; own spec and plan, self-approved |
| 3 contradict | fail, 6 of 7 | no `supersedes:`; see F30 |
| 4 refactor | not reached | |
| 5 describe | not reached | |

**F28 and F29 are fixed.** Sprint 2 no longer stops at a design: with `--setting-sources
project,local` the user-level brainstorming skill never loads, and the same prompt that produced a
design and no code on the previous run produced a passing sprint. And the failing sprint's ending
was readable from the results file, which is how F30 below was diagnosed without paying for the
run again.

B1, B2, B3 hold on this run. B4 does not. B5, B6 have no evidence yet. B7, B8 hold (`--dry`: 23
tasks, one with steps; the `campaign-legacy` fixture and task are gone). B9 is this file.

## F30 — a drafted change is not a declaration; the previous sprint's plan governs until someone closes it

**Component: `currentChange()` in `.aidlc/lib/artifacts.mjs`. Breaks B4. F10, fourth instance.**

Sprint 3 did what the prompt asked, up to a point. It created
`.aidlc/artifacts/paid-invoices-not-overdue/` with an intent, a spec of five behaviours and a
plan. It then argued that sprint 1's behaviour "was describing the behaviour for unpaid invoices"
and that this was "a logical refinement, not a rewrite" — F9's rationalisation, word for word in
shape — recorded no `supersedes:`, never approved its spec, and edited `src/ledger.mjs`.

The write went through, and `diff_owned_by_current_change` passed, because the current change
was still `partial-payment`: sprint 2's spec was the most recently approved, sprint 2's change was
never closed, and its plan owns `src/ledger.mjs`. `a-diff-belongs-to-one-change` closed the
route where a refused plan's work proceeds on an older plan (F26) and the route where a closed
change's plan authorises a write (F10, second instance). It left this one open: a *drafted*
change, unapproved, while the previous change stays open.

Nothing instructed the agent wrongly. The `implement` skill's new last step says to close a
delivered change, and the unattended notice says to approve one's own gates; the agent did
neither, which is the F6 shape — instruction that waits to be followed steers nobody. The
structural answer is that writing a spec *is* the declaration: an open change whose spec has real
content and no approval is work that has been declared and not yet gated, and until it is
approved or closed no product file may change. `a-plan-proves-its-spec` already tells a filled-in
spec from an untouched scaffold (`templateMarkers`), so a backlog of empty intents blocks
nothing. This is `a-draft-is-a-declaration`, the next change.

## Also seen, not new

- Every Proof row the agent wrote names prose rather than a test, so `behaviours_have_tests`
  reports fourteen unverifiable rows and no violation. F11 and F15, unchanged by design.
- Sprint 3's agent used `paidCents ?? 0` "for backward compatibility with Spring 1 invoices" —
  harmless, and a reminder that the cheap model is the point of the eval model.

## Run 2 — 2026-09-06, commit `8893313`, results `2026-09-06T06-43-37-920Z.json`

After `a-draft-is-a-declaration`. **Fail at sprint 3 of 5**, one assertion. $1.04, 9 minutes 36
seconds.

| sprint | verdict | notes |
|---|---|---|
| 1 adopt | **pass**, 8 of 8 | |
| 2 extend | **pass**, 5 of 5 | |
| 3 contradict | fail, 6 of 7 | own change created **and approved**, code written under its own plan; no `supersedes:` link — F31 |
| 4, 5 | not reached | |

**F30 is fixed.** Sprint 3 created `paid-never-overdue`, approved its spec and plan (the
unattended list now shows six approvals, not four), and every product write belonged to that
plan: `diff_owned_by_current_change` reports `current: paid-never-overdue`. The refusal did what
the spec said it would: the agent could not write until it had gated its own work.

## F31 — the agent names the superseded behaviour in prose and leaves the field empty

**Component: `contentIssues()` in `.aidlc/lib/artifacts.mjs`, the spec approval gate. Breaks B4.
F9, second instance.**

Sprint 3's closing summary: "the approved add-balance-overdue spec (Behavior 12) explicitly
promised that `isOverdue()` returns true for any past-due invoice, regardless of payment … the
earlier spec's behavior is being superseded … explicit safeguards noting the contradiction with
add-balance-overdue#B12". The agent did the analysis, named the behaviour by its exact id, used
the word, and wrote all of it into the spec's Safeguards prose. The frontmatter has no
`supersedes:` line, so nothing is superseded and `harness status` says sprint 1's promise still
stands.

F9 recorded the first instance — "evolves" instead of "supersedes" — and its fix gave the agent a
field. This instance shows the field is not enough when the template's reminder sits at the
bottom of the body: the agent wrote where it was reminded. The mechanical answer is at the gate:
a spec whose body names `<slug>#B<n>` for a behaviour of another approved spec, and whose
frontmatter does not link it, is refused at approval with the line to add. The agent has already
made the judgment by writing the id; the gate only insists it be recorded where the harness can
read it. `a-named-behaviour-is-a-link`, the next change.

## Run 3 — 2026-09-06, commit `c41ca8b`, results `2026-09-06T07-01-07-522Z.json`

After `a-named-behaviour-is-a-link`. **Fail at sprint 3 of 5**, two assertions. $0.52, 5 minutes
44 seconds.

| sprint | verdict | notes |
|---|---|---|
| 1 adopt | **pass**, 8 of 8 | |
| 2 extend | **pass**, 5 of 5 | |
| 3 contradict | fail, 5 of 7 | no new change; sprint 2's approved spec edited in place; see F32 |
| 4, 5 | not reached | |

## F32 — editing an approved spec hands governance to an older plan

**Component: `currentChange()` / `draftsAwaitingGate()` in `.aidlc/lib/artifacts.mjs`. Breaks
B4. F10, fifth instance; F9, third.**

This time the agent created no change. It appended a "Breaking Changes" section with two new
behaviours to `record-payment/spec.md` — sprint 2's spec, approved and committed — and then
edited `src/ledger.mjs` and `tests/ledger.test.mjs`. Its summary: "Rather than rewrite the
approved spec, I've updated record-payment/spec.md … Explicitly calls out what contradicts the
Sprint 1 spec." No id was named, so `a-named-behaviour-is-a-link` had nothing to match; no new
spec was drafted, so `a-draft-is-a-declaration` saw nothing waiting.

The write went through because editing an approved spec makes its approval `stale-approval`,
and a stale spec is not `approved`, so it is not current — and the next most recent approved
spec is sprint 1's, whose plan owns both files. `stale-approval` was built as a *report*
("re-approve it or restore the approved text"); as a state it silently steps aside. The rule
that a filled-in draft awaits gate 1 applies with more force here: an approved spec that has
been edited is a declaration that the promise changed, and until a human (or the unattended
runner) re-approves it, nothing may change under any plan. `an-edited-approval-awaits-its-gate`,
the next change.

What this run did not test: the two gates landed since run 2. No spec was drafted and no id was
named, so neither fired. They stand.

## Run 4 — 2026-09-06, commit `7ab3984`, results `2026-09-06T07-35-20-068Z.json`

After `an-edited-approval-awaits-its-gate`. **Fail at sprint 3 of 5, one assertion.** $0.81, 8
minutes 36 seconds.

| sprint | verdict | notes |
|---|---|---|
| 1 adopt | **pass**, 8 of 8 | |
| 2 extend | **pass**, 5 of 5 | |
| 3 contradict | fail, 6 of 7 | own change, approved, own plan, correct code and test; no `supersedes:` — F33 |
| 4, 5 | not reached | |

**Governance is now whole.** Across four runs sprint 3 tried four routes: a drafted change left
unapproved (F30), an id in prose (F31), an edit to the previous approved spec (F32), and now
none of them — it created `ledger-paid-never-overdue`, approved its spec and plan, and wrote
under that plan alone. `diff_owned_by_current_change` reports `current: ledger-paid-never-overdue`.
The F10 family is closed: a product write is permitted by the plan of the change being made and
by nothing else, and every way found so far of not having such a plan is refused.

## F33 — the reversal is acknowledged, never linked

**Component: gate 1, and the eval model's judgment. Breaks B4. F9, fourth instance.**

The agent's summary: "The approved `ledger-partial-payments` spec had a safeguard: 'IsOverdue
status must be unaffected by payment amounts'. Your requirement contradicts this, so I created a
new artifact … acknowledging the contradiction with the previous safeguard." It found the
contradiction — this time in a Safeguards sentence rather than a numbered behaviour, so no id
existed to name — acknowledged it in the intent's prose, and recorded nothing. The frontmatter
comment in the template was in front of it; the `spec` skill says the field is refused-for if
an id is named; the prompt says to deal with the contradiction properly. Four runs, four
rationalisations, zero links.

What the harness can still do mechanically, without inferring anything from prose: at gate 1,
when other open changes have approved specs, require the new spec to declare its relation to
each — `supersedes: <slug>#B<n>` or `extends: <slug>` — so the question is asked at the moment
and the answer is on record. That is one more field and one more refusal, and it may only
produce four `extends:` lines from an agent that has called four reversals refinements. Beyond
that, this assertion measures the judgment of a cheap eval model, which is a truth the suite
should keep telling rather than a defect the harness can fix.

## Run 5 — 2026-09-06, commit `dc10a6c`, results `2026-09-06T07-55-05-139Z.json`

After `a-change-declares-its-relation`. **Fail at sprint 5 of 5, two assertions.** $1.12, 11
minutes 41 seconds. 29 of 31 assertions pass.

| sprint | verdict | notes |
|---|---|---|
| 1 adopt | **pass**, 8 of 8 | |
| 2 extend | **pass**, 5 of 5 | |
| 3 contradict | **pass**, 7 of 7 | `supersedes: ledger-functions#B6` recorded — the first time in five runs |
| 4 refactor | **pass**, 7 of 7 | own change `ledger-store-refactor`, store split, four tests kept, fees untouched |
| 5 describe | fail, 1 of 3 | `docs/PRODUCT.md` never written — F34 |

**B4 holds.** With the relation gate asking, sprint 3's agent wrote "Created a new artifact
(paid-never-overdue) with an explicit `supersedes: ledger-functions#B6` marker … this
intentionally overrides the earlier behaviour." Four runs of prose, one run of a link, and the
difference was a gate that asks rather than a field that waits.

**B5 holds, and answers the analysis's A3 question the cheap way.** The refactor sprint created
its own change with its own spec and plan, and neither of the earlier specs moved. A pure
refactor reaches the contract as a new change that extends the earlier ones; nothing needed a
`sync` verb. Recorded here as the finding the analysis asked for: no mechanism, one convention
the gates already enforce.

## F34 — a refused first write becomes a question nobody answers

**Component: the `intent` skill's closing step, under `AIDLC_UNATTENDED`. Breaks B6. F23,
second instance.**

Sprint 5's first act was to write `docs/PRODUCT.md`; the guard refused it, correctly — a product
file with no change to belong to. The agent then started the chain, wrote an intent, and ended
its turn with "Does this intent match what you want?". The unattended notice says nobody will
answer; the agent asked anyway, because the `intent` skill's last step asks. F23 fixed the
notice; the skill still ends in a question, and an instruction that says "do not ask" loses to
an instruction that says "ask".

Two things could close this. Cheaper: the `intent` skill's last step says to confirm with the
human *unless* the session is unattended, in which case go on to the spec. That is instruction
against instruction again, and F6/F7/F26/F30 say which wins. Structural: under
`AIDLC_UNATTENDED` the Stop hook refuses to end a turn that leaves a written spec, or an intent
with no spec, awaiting its gate — once per session, with the reason — so the agent that stops
to ask is sent back to the work with the answer it needs: nobody is coming. Claude Code's Stop
hook can return `decision: block` for exactly this.

## Run 6 — 2026-09-06, commit `e8347dc`, results `2026-09-06T08-27-40-601Z.json`

After `an-unattended-turn-does-not-end-on-a-question`. **Fail at sprint 3 of 5, one assertion.**
$1.20, 9 minutes 47 seconds.

| sprint | verdict | notes |
|---|---|---|
| 1 adopt | **pass**, 8 of 8 | |
| 2 extend | **pass**, 5 of 5 | |
| 3 contradict | fail, 6 of 7 | amended sprint 2's approved spec and plan, re-approved both; no `supersedes:` — F35 |
| 4, 5 | not reached | |

## F35 — an approved spec is amended, and its old `extends:` answers the new question

**Component: gate 1, on re-approval of an edited approved spec. Breaks B4. F9, fifth instance.**

The route this time: the agent edited `record-payment/spec.md` (sprint 2's, approved) to add
B7 "isOverdue returns false for fully paid invoices", edited its plan to add a step, was refused
its first product write — `an-edited-approval-awaits-its-gate` working — and then re-approved
both. The relation gate asked nothing: `record-payment` already carried
`extends: add-balance-functions` from sprint 2, which was true when sprint 2 wrote it and is
false after B7. The agent's own words: "an intentional business logic refinement."

Each gate so far closes a route and the next run finds the one beside it. This one is the
amendment route: adding behaviours to an approved spec keeps its declarations and gets them
re-approved as if nothing changed. The mechanical answer, for the next intent and not for this
run: an approved spec's behaviour set is frozen — re-approval is refused when `### B<n>` headings
were added since the committed approved text, with the message that new behaviours belong in a
new change, which must declare its relation. Prose fixes stay allowed; the record of what was
promised stays what it was. Recorded as `an-approved-spec-does-not-grow`, intent only, so that
this change can close and the owner can decide whether to run again.

## Closing, 2026-09-06

Six runs, $5.24, every one under twelve minutes. The campaign has never been fully green. What
it has done is find seven harness defects (F28–F35) in a day, each fixed by one small rule with
a test, and prove that the fixes hold: sprints 1, 2 and 4 pass on every run that reaches them,
sprint 3 governs itself on every route it has tried since F32, and on run 5 it recorded the link.

| behaviour | state |
|---|---|
| B1 one brownfield fixture | proven, `test/campaign.test.mjs` |
| B2 sprint 1 adopts | proven, six runs |
| B3 sprint 2 extends | proven, six runs |
| B4 sprint 3 contradicts and records it | proven once (run 5); fails by a new route on runs 1–4 and 6 |
| B5 sprint 4 is a pure refactor | proven once (run 5); the contract answer to A3 is "a new change that extends" |
| B6 sprint 5 states the product | not proven; reached once, refused correctly, ended on a question (F34, fixed since, unproven) |
| B7 bounded | proven, `--dry` and `test/campaign.test.mjs` |
| B8 the others are gone | `campaign-legacy` gone, proven; `../dunning` pending the owner's yes |
| B9 findings to evidence | this file |

Closed with B4, B5 proven once and B6 unproven, on the owner's instruction that the fix-and-run
loop ends here. The next run is one command, and `an-approved-spec-does-not-grow` is the intent
that names what it would find.

## Still to do in this change

- Re-run once `a-draft-is-a-declaration` lands; B4, B5, B6 need that run.
- Delete `../dunning`, with the owner's spoken yes in that session (B8).
