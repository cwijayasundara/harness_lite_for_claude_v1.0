---
status: draft
---
# Plan: campaigns-run-unattended

## Approach

Nothing today *prevents* an agent from running `harness approve`. The gate is convention: CLAUDE.md
says the approval is the human's, and `campaign-ledger`'s agent obeyed it and stopped. So the fix
is not to remove an enforcement that does not exist. It is to make an unattended approval a
different, visibly marked thing, and to tell the agent — only when unattended — that it may take it.

Four small pieces.

`AIDLC_UNATTENDED` is an environment variable set by `evals/lib/invoker.mjs` on the `claude`
process it spawns, alongside the `HARNESS_HOME` it already sets there. An environment variable is
the right shape for B3: it comes from the runner that staged the copy, and no file inside the
working copy can produce it. `approve()` reads `process.env` and nothing else — it must never
consult `harness.toml`, settings, or any path under the copy, because `evidence.md` F2 records an
agent that rewrote `harness.toml` to disable `require_contract`, and a switch that agent could have
written would be the same defect wearing a different hat.

`approve()` in `.aidlc/lib/artifacts.mjs` gains one branch: when the variable is set, `by` is
forced to the constant `unattended-eval-run` regardless of what `--by` supplied. Forced, not
defaulted — B2 says an agent that can choose its own approver name can write a person's, and the
only way that is not true is if the value is unreachable from the caller. Every other precondition
stays exactly where it is: committed-first, plan-after-spec, the body digest, `stale-approval`.
That is B5, and it is why the branch goes at the identity and not at the top of the function.

`harness status` gains one line when the variable is set, naming the two commands. CLAUDE.md
already tells the agent to run `harness status` and resume the first incomplete stage, so this
reaches the agent through a path it already walks. Nothing else about the agent's instructions
changes, and no skill changes at all.

`evals/run.mjs` scans each step's working copy for artifacts stamped `unattended-eval-run` and
prints them, and puts the list in the results JSON. That is B7: a mechanism that substitutes for a
human should be the loudest thing in the log, not a detail in a tmpdir that is about to be deleted.

Rejected: a token or a signed nonce instead of a plain variable. An agent with Bash can set any
variable it likes, so no value defeats a determined agent inside its own process — and a real
repository has no runner to set one at all, which is the case that actually matters. Spending
complexity on a threat the shape cannot address, while the honest answer is that the approval is
stamped and visible, would be security theatre.

Rejected: auto-approving from the runner between steps. `campaign-ledger` stopped *inside* step 1,
before writing code, so an approval that only happens at step boundaries arrives a sprint too late.

Rejected: telling the agent to self-approve in the campaign task prompts. It would work for these
two tasks and for no other, and it would put workflow control in `tasks.json`, where the next
person to write a campaign has to remember it.

## Files

- `.aidlc/lib/artifacts.mjs`
- `.aidlc/bin/harness`
- `evals/lib/invoker.mjs`
- `evals/run.mjs`
- `test/autogate.test.mjs`
- `.aidlc/artifacts/campaigns-run-unattended/`
- `docs/OPERATING.md`

## Order

1. `test/autogate.test.mjs` — the identity is forced (a `--by` of `cwijayasundara` still records
   `unattended-eval-run`), the variable is the only source (a `harness.toml` asking for it changes
   nothing), and with the variable unset every existing precondition and the human gate are
   untouched. Red first: `approve` currently ignores the variable entirely.
2. `.aidlc/lib/artifacts.mjs` — the forced-identity branch in `approve()`, reading `process.env`
   only.
3. `test/autogate.test.mjs` again — uncommitted still refused, plan-before-spec still refused,
   digest still written, `stale-approval` still fires, all with the variable set. B5.
4. `.aidlc/bin/harness` — the `status` line, shown only when the variable is set.
5. `evals/lib/invoker.mjs` — set `AIDLC_UNATTENDED` in the spawn env next to `HARNESS_HOME`.
6. `evals/run.mjs` — collect and report auto-approvals per step, into stdout and the results JSON.
7. `docs/OPERATING.md` — one paragraph in the campaigns section: what the variable does, that it is
   set by the runner and never by hand, and that an artifact stamped `unattended-eval-run` in a real
   repository means something went wrong.
8. Re-run `campaign-ledger`. B6 holds only if sprint 3 executes.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/autogate.test.mjs` — an approval succeeds with the variable set and no human |
| B2 | `test/autogate.test.mjs` — `--by cwijayasundara` still records `unattended-eval-run` |
| B3 | `test/autogate.test.mjs` — a working copy whose `harness.toml` asks for auto-approval is still refused |
| B4 | the existing suite unchanged: `test/lifecycle-cli.test.mjs`, `test/guard.test.mjs`, `test/scope-drift.test.mjs` pass untouched |
| B5 | `test/autogate.test.mjs` — uncommitted, plan-before-spec, digest and `stale-approval` all still hold with the variable set |
| B6 | the re-run of `campaign-ledger` recorded in `.aidlc/artifacts/evolving-scope/evidence.md`: sprint 3 executes |
| B7 | `test/autogate.test.mjs` — the results JSON of a fake-invoker run lists the auto-approved artifacts |
