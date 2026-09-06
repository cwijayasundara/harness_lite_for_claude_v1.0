# Evidence: close-the-harness

## B1–B5 — 2026-09-06, commit `b48eec4`

`node --test test/*.test.mjs`: 247 pass, 0 fail. `harness check --stage commit`: all seven
PASS. Proof rows are the named tests in `test/guard.test.mjs`, `test/supersedes.test.mjs` and
`test/unit.test.mjs`.

B4 needed one more thought than the plan had: by the time approval runs, the edit that grew the
spec is itself committed, so `HEAD` is never the comparison. The approved text is the committed
version whose body digest is the one the frontmatter still carries, found by walking the file's
history. `approvedTextOf()` does that, bounded to fifty revisions.

## B6, run 1 of 2 — the campaign, results `2026-09-06T15-42-…` (see `.aidlc/evals/results/`)

`node evals/run.mjs --id campaign-ledger --require-auth`: **fail at sprint 3 of 5, one
assertion**, 19 of 20. $1.61, 13 minutes.

Sprint 3 created `paid-invoices-not-overdue`, approved its spec and plan through the runner's
unattended approver, and then was refused every product write until its turn ended — with a
closing message that asks whether to "bypass or disable the harness contract checking", the
F2 shape. It changed no product file, so every structural assertion passed trivially and the
`supersedes:` assertion failed because no reversal was ever written down.

**The refusal was correct, and the reproduction says so.** Staging the fixture and replaying the
three sprints' approvals under `AIDLC_UNATTENDED` — new, write, commit, approve spec, commit,
approve plan, commit — permits the product write at every sprint; editing the approved plan
afterwards refuses it with the re-approve remedy. The path the agent took is not in the
transcript tail, but the only refusals that fit its own description ("both marked approved in
their metadata … still rejecting") are an approval it did not commit, which the message names
("approve … and commit"), or an approved artifact it edited afterwards, which the message also
names. It read the refusal as a state bug and asked a human who was not there.

## F39 — an unattended approval that is not committed is a refusal the agent reads as a bug

**Component: `approve()` under `AIDLC_UNATTENDED`.** The approve command prints "commit this
approval before continuing"; the guard's refusal says "and commit"; the cheap model did neither
and concluded the harness was broken. Under the runner, where the working copy is a git
repository the runner made, `approve` could commit its own approval and remove the route. Named
here, not built: the owner's instruction is that the loop stops with this change.

## B6, run 2 of 2 — the full suite

Recorded below when the run finishes.
