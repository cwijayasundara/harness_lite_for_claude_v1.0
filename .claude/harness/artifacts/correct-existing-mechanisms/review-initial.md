# Independent review

Base: 59e424236480c43ad6f35ec87c918094443ef7c8
Candidate: 74b6b78d839dde3e1eca257dfdf7a86a4907edee
Model: claude-opus-5
Cost USD: 1.8742674999999998
Checks: run separately; not claimed by this review.

# Review: `correct-existing-mechanisms` — base `59e4242` → candidate `74b6b78`

Reviewer limitation, stated up front: **I ran no tests, no build, and no `harness check`.** Every claim below comes from reading `candidate.diff` and the `candidate/` snapshot. Findings that `harness check --stage commit` already enforces are excluded per `.aidlc/policies/review.md:23`.

## Suppressions, threshold raises, overridden controls

No `# noqa`, no lint/type suppressions, no raised numeric threshold, no widened `deny_bash`. Four controls change strength, and the direction matters:

| Location | Change | Direction |
|---|---|---|
| `.aidlc/lib/runner.mjs:110` | `ok` now requires `pass`/`skipped`; `errored` no longer passes | tightened (B1) |
| `.aidlc/hooks/dispatch.mjs:95` | `APPROVE_IS_THE_HUMANS` applied unconditionally; env exemptions gone | tightened (B4) |
| `.aidlc/lib/artifacts.mjs:100-102` | `AIDLC_UNATTENDED` no longer forces an approver identity | tightened (B4) |
| `.aidlc/hooks/dispatch.mjs:215-216` | the unattended Stop block is deleted, replaced by a comment | **removed**, explicitly authorised by spec `B4` |
| `.aidlc/roles/evaluator.md:1-7` | `isolation: worktree` and `Bash` removed from the agent frontmatter | **weakened** — see Important 1 |

The Stop-hook removal is in scope and matches B4. The evaluator frontmatter change is the one override that its replacement does not fully cover.

## Important

### Important 1 — Compliance pass; B2 — `.aidlc/roles/evaluator.md:1-7`, `.claude-plugin/plugin.json:9-13`

B2 requires: *"The evaluator receives explicit base/candidate commits, has only read tools, and returns findings saved by the caller."* `harness review` (`.aidlc/lib/review.mjs:22-31`) satisfies all three. The shipped **agent** does not, and this change is what makes it reachable.

Two edits combine badly:

- `.claude-plugin/plugin.json:11` repoints the manifest from the deleted `reviewer.md` to `./.aidlc/roles/evaluator.md`. Before this change the manifest named a nonexistent file, so no such agent shipped; now it does. (Fixing the dangling reference is required by B5 — the problem is which file it now names.)
- `.aidlc/roles/evaluator.md:6` drops `isolation: worktree`, and line 4 drops `Bash`.

The result: an agent whose `description` (line 3) advertises *"Use this agent to evaluate a diff … Typical triggers include preparing a pull request"* is now loadable in an ordinary session, has no isolation, and receives no base/candidate. It reads the live working tree the generator just wrote — the exact condition B2 exists to rule out. Its own body (lines 27-31) tells it to run `harness review --base … --candidate …`, which it cannot do: line 4 gives it no shell.

Either drop `evaluator.md` from the manifest and point B5's "existing agents" requirement at the agents that are actually invocable, or state in the frontmatter body that the agent form reviews an unspecified checkout and is not the B2-conforming path. As written, the only in-session path the plugin exposes is the non-conforming one.

### Important 2 — Compliance pass; B4, B7 — `docs/OPERATING.md:189-191`

> "And approval is the human's gate: the pre-bash hook refuses `harness approve` from an agent in an attended session — a human's shell runs no hook — and **stands down only under the runner's `AIDLC_UNATTENDED`**."

That exemption was removed in this diff. `.aidlc/hooks/dispatch.mjs:95` now includes `APPROVE_IS_THE_HUMANS` in every rule set, and `test/guard.test.mjs:2105` asserts the opposite of the sentence above (`assert.match(unattended, /approval is the human/i, 'trial flags do not grant approval authority')`). B7 requires guidance to describe approval metadata accurately, and B4 requires that no environment flag permit self-approval; this paragraph tells an operator a bypass still exists. `docs/OPERATING.md:96` was updated correctly — line 191 was missed.

### Important 3 — Compliance pass; spec Outcome ("measured integration evidence and honest limitations") — `.aidlc/evals/smoke/initial-sandbox-attempt.json:10`

The file records `"usd": 0` for a run that produced no billing data. `docs/IMPROVEMENT-PLAN.md` (§"Correct existing mechanisms implemented") says of this exact run: *"returned no billing data; its cost is unreported, not assumed free."* The failure path in `evals/agent-mechanisms.mjs:88-92` writes `usd: null`, `billingComplete: false`, `reportedUsd` — none of which appear in this file, so it was not produced by that path. The one artifact a reader would check to verify the honesty claim contradicts it. Set `usd: null` and add `billingComplete: false`, or regenerate it through the code path.

## Nits (5 reported; ~4 further instances of the same doc-drift class not listed)

1. **Bugs pass; B4** — `.aidlc/hooks/dispatch.mjs:19`: `draftsAwaitingGate` and `awaitingGateRemedy` are still imported but no longer referenced anywhere in the file after the Stop block was deleted at lines 215-216.
2. **Compliance pass; B7** — `.aidlc/hooks/dispatch.mjs:104`: the shell-bypass refusal still reads *"Same rule applies: not mid-session."* Every sibling message (`guard.mjs:64`, `dispatch.mjs:52`, `bin/harness:170`) was reworded to the instructions-or-permissions framing; this user-visible one still asserts the retired cache rationale.
3. **Bugs pass; B4** — `.aidlc/lib/artifacts.mjs:102,127`: `discardedBy` is now hard-coded to `null` and no caller reads it (`bin/harness` dropped the only consumer). Dead field on a public return value.
4. **Compliance pass; B5** — `.github/workflows/harness.yml:5`: `push:` lost its `branches: [main]` filter while `pull_request:` is retained, so every commit on a PR branch now runs the whole matrix twice. B5 asks the published workflow to run the deterministic tests, not to double the spend to do it; if the broad trigger is deliberate, say so in the file's header comment.
5. **Compliance pass; spec Outcome** — `docs/IMPROVEMENT-PLAN.md` §"Live result" cites `$0.1395525` for the successful smoke, but the only committed evidence (`.aidlc/evals/smoke/agent-mechanisms.json:20`) reports `0.18534270000000003`. The earlier run's file was overwritten by the actual-plugin pass; the quoted figure now has no artifact behind it.

Not reported, same class: stale `AIDLC_UNATTENDED` narration in `test/autogate.test.mjs:1`, `test/evals.test.mjs:341`, `test/guard.test.mjs:94`, and the retained-but-inaccurate `PREFIX_CACHE_PATHS` export name (`.aidlc/lib/paths.mjs:43-46`, acknowledged in its own comment).

## No findings

- **Security pass.** `.aidlc/lib/review.mjs:14-31` labels the snapshot untrusted in the prompt, disables inherited settings/MCP/hooks, exports via `git archive` rather than reusing the checkout, and writes output only after `is_error`/empty-result checks (`review.mjs:41-45`) — a failed invocation cannot become a review. `artifacts.mjs:101` newline-rejects `--by`, closing frontmatter injection through the approver label. `approvals.mjs:15-24` keeps receipts in the parent process and re-derives them from disk, so an agent-written digest cannot satisfy `assertImplementation`. No new logging of credentials or PII.
- **B1, B3, B6** read as implemented and covered: `runner.mjs:65,102,110`, `normalize.mjs:102-106`, `artifacts.mjs:126,136-138`, `eval-gate.mjs:38,137,193-194`. The `pre-tool` dispatch case already existed (`dispatch.mjs:185-190`); `adapters/claude/hooks.json` was simply stale, and it now matches `renderClaudeHooks(policy.json)` (`projection.mjs:23`, `hooks/policy.json:10-14`). Plan `## Files` covers every path this diff touches.

## Verdict

**changes-requested**

Required to clear: reconcile `.claude-plugin/plugin.json:11` with B2 (Important 1); correct `docs/OPERATING.md:191`; correct `.aidlc/evals/smoke/initial-sandbox-attempt.json:10`. Two of the three are one-line edits.

Note for the runner: this is repair attempt 1 of at most 2 on these findings. Important 1 is a design question, not a defect — if a second pass disagrees rather than fixes, send it to the human instead of a third automated repair.
