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

## Still to do in this change

- Re-run once `a-draft-is-a-declaration` lands; B4, B5, B6 need that run.
- Delete `../dunning`, with the owner's spoken yes in that session (B8).
