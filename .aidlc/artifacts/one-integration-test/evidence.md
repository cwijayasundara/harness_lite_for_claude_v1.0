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

## Still to do in this change

- Re-run once `a-draft-is-a-declaration` lands; B4, B5, B6 need that run.
- Delete `../dunning`, with the owner's spoken yes in that session (B8).
