# Evidence: a-diff-belongs-to-one-change

## B1–B6, 2026-09-06, commit `ea69644`

`node --test test/*.test.mjs`: 212 pass, 0 fail. `harness check --stage commit`: secrets, test,
scope-drift, budget, tamper, arch, test_quality all PASS. Proof rows B1–B6 are the named tests in
`test/current-change.test.mjs`, `test/guard.test.mjs` and `test/scope-drift.test.mjs`.

**The mechanism refused its own author.** The hook reads `artifacts.mjs` live, so the moment
`governingPlans` returned only the current change's plan, the current change became
`every-control-fires-or-goes` — the spec the owner had approved last — and this change's two
remaining edits were refused:

    test/scope-drift.test.mjs is outside the current change "every-control-fires-or-goes" — its
    plan's ## Files does not name this path. Add the path and re-approve the plan, or close
    "every-control-fires-or-goes" if that work is done.

The owner re-approved this change's spec (`harness approve <slug> spec` on an already-approved
spec restamps `at:`, which is the switch the spec describes), and the edits went through. That is
B2 observed outside a test, with the F2 route closed: the message names a next step and not the
switch.

## B7, first attempt — 2026-09-06, run `2026-09-06T05-50-22-592Z`

`node evals/run.mjs --id campaign-ledger --require-auth`: **fail at sprint 2 of 3**, $0.71,
about 10 minutes. Sprint 1 passed every assertion. Sprint 3 never ran, so B7 has no evidence yet.
It will come from the five-sprint run `one-integration-test` makes, once the two findings below
are fixed there.

## F28 — the unattended agent inherits the developer's user-level plugins

**Component: `evals/lib/invoker.mjs`. Breaks `campaigns-run-unattended` B1 by a route it did not
cover.**

Sprint 2 ended with a design in the `superpowers:brainstorming` skill's format — "Classification:
Bounded … Short Design … Files touched … Testing" — and no code. That skill is installed at user
level on this machine (`superpowers@claude-plugins-official` in `~/.claude/settings.json`) and its
hard gate is "do not write any code until your human partner has approved". The eval agent
obeyed it. The unattended notice tells the agent it may approve its own *harness* gates and must
decide its own questions (F1, F23); it says nothing about a third party's gate it was never meant
to have.

The runner passes `--plugin-dir` for the harness and nothing that isolates the child from the
user's own settings, so what the suite measures depends on whose laptop it runs on. Fix in the
invoker: `--setting-sources project` (or the equivalent that excludes user settings), so the
child sees the fixture's `.claude/` and the harness plugin and nothing else. CI has no user
settings, which is why this never showed there — and why a laptop run and a CI run of the same
commit could disagree.

## F29 — the results file keeps the first 20,000 characters of a campaign, which is the sprint that passed

**Component: `evals/run.mjs`, the transcript cap.**

The transcript is stored only on failure and sliced from the head. In a campaign the head is
sprint 1's transcript, and sprint 1 is the one that passed; the failing sprint's ending — the
part that says why — is cut off. F28 was diagnosed from the last 3,000 characters that survived,
by luck. Keep the tail, or cap per step.

## Closed

Closed 2026-09-06 with B1–B6 proven and B7 deferred to the `one-integration-test` run, whose plan
is amended to fix F28 and F29 first.
