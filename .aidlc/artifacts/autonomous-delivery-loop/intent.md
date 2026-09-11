---
status: draft
source: docs/LEAN-HARNESS-IMPLEMENTATION-BACKLOG.md
source_revision: 9ee37dcb10f6f0e173d25f600ee81100f02fff76
---
# Intent: autonomous-delivery-loop

- **Date:** 2026-09-11
- **Author:** cwijayasundara
- **Source:** `docs/LEAN-HARNESS-IMPLEMENTATION-BACKLOG.md` F10, F04 and F15, read against
  the AI-native SDLC playbook's target shape: Plan and Design are the only human gates.

## Problem

The harness has every stage of the playbook and nothing that drives them.

After the human approves the plan at gate 2, a person types `implement`, reads the result,
types `harness check`, reads the findings, types `implement` again, types `harness review`,
reads the review, and types `implement` a third time. Each of those keystrokes is a pause
inside the build loop with no decision attached to it — the human is not judging anything,
they are relaying output from one command into the next.

Law 8 already names this as the wrong shape: "Approval pauses inside the build loop destroy
the parallelism that makes agents worth running; gates belong at the edges, not in the
middle." The edges are gate 1 (spec), gate 2 (plan) and the merge. The middle is currently
made of human turns anyway.

Three consequences follow, and all three are observable today:

**It does not survive interruption.** `evals/lib/comparison.mjs` and `evals/lib/campaign.mjs`
both write incremental state — `comparison.json` carries a `scheduledAttempts` list committed
before the first call, and `phases.json` is rewritten after every event. Nothing reads either
file back. A killed run is diagnosable and not resumable, so an interrupted delivery restarts
from the beginning and pays for the completed phases a second time.

**It re-runs work it already did.** `baseline.capture()` calls the whole `stop` stage, and
`baseline` is itself a control in the `commit` stage. So `harness check --stage commit` runs
the full test suite twice. A human doing this once an hour does not notice. A loop doing it on
every iteration pays for it on every iteration.

**The loop does not close.** `examples/maintain/band-to-intent.mjs` turns a control-band breach
into an `intent.md`, which is the Maintain→Plan edge the playbook describes. But it writes no
`source` or `source_revision` frontmatter, and the spec approval gate refuses an intent without
them. The intent it produces cannot be carried through the chain it was written to start.

## Proposed outcome

A human approves the spec, approves the plan, and the next thing they are asked for is a
merge decision on a green pull request.

Between those points the harness implements the change, runs the checks, refactors under
green checks, obtains an independent review, repairs what the review and the checks find, and
opens the PR — without a human turn, and without being able to grant itself either of the
approvals it did not receive.

The run is bounded in wall-clock, spend and repair attempts; it stops rather than exceeding
any of them, and says which bound it hit. It is resumable: interrupted at any phase it
continues from that phase rather than repeating the ones that completed. If the approved plan
changed while it was stopped, it refuses to continue, because the authority it was running
under is gone.

## Affected users and systems

- **The engineer** driving a change, who stops relaying command output and starts reviewing
  a finished PR.
- **The human approver**, whose two gates become the only two moments they are required, and
  whose merge decision stays theirs.
- `.aidlc/bin/harness` — gains the driver command; Law 2 puts control flow here.
- `.aidlc/lib/baseline.mjs`, `.aidlc/lib/runner.mjs` — the duplicate stage execution.
- `examples/maintain/band-to-intent.mjs` — the Maintain→Plan edge.
- `.github/workflows/harness.yml` — the same driver, run in CI.
- The ledger, which gains rows for work no human typed and therefore must stay attributable.

## Constraints

- **No new control.** Law 11 admits a control only with a failing eval or a defect recorded
  while building a non-harness application. This is control flow, not a control: no new skill,
  hook, agent or check, and nothing under `[limits]` moves. The budget is at or near its
  ceiling on agents, skills and hooks.
- **Zero dependencies.** The suite must run on a cold clone with no model calls; the driver's
  tests use a fake `claude` on PATH.
- **Subscription-only.** No API key, no API fallback, no alternate provider. Model calls
  happen only behind an explicit `--live`, matching the existing eval runners.
- **The driver may not open a gate it did not receive.** Two mechanisms make this possible
  today and both must be closed by construction rather than assumed: `harness approve` is
  blocked for agents by a hook but not for a driver process that runs no hook, and
  `review.md`'s `status: approved` is an unbound frontmatter key on a non-gated artifact that
  the write guard always permits, yet it alone advances the change to `merge`.
- **Human merge stays the third gate.** The driver stops at a merge-ready PR. Branch
  protection, not the harness, is what enforces it.

## Open questions

None. The merge boundary was decided: the driver stops at the PR and does not merge.
