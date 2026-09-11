---
status: changes-requested-repaired
base: 8b9e5ff
candidate: 02f71e1
evaluator: harness-evaluator (opus), read-only, round 1
repairs: 0c3e660, c740fc6
---
# Review: the-harness-needs-no-container

**VERDICT (round 1): changes-requested.** Two blocking, two major, five minor, two nits. All
repaired except where noted. Three findings were independently re-verified by the caller against
the working tree before repair.

## What the review did NOT find, and checked hard for

**B4 holds — the one property whose loss would make this change harmful.** Every product-trial
caller reaches the refusal: `campaign.mjs:206`, `:305`, `:353` all pass a sandbox, and
`comparison.mjs:145` / `run.mjs:253` pass one too. `invoker.mjs:63` throws before auth and before
`spawnSync`. No route around it was found. `available=false` in `run.mjs` is honesty — an explicit
`credentials_or_isolation_unavailable` record — not safety; without it each attempt would still
throw. Commit `c43ca0b` landed the refusal alone and first, so no commit in the series could run a
live agent unsandboxed.

**The billing-test retargeting was verified, not taken on trust.** `if (sandbox) throw` (`:63`)
precedes `requireSubscription` (`:73`), so asserting `/API billing is disabled/` on a product call
would now fail rather than mask — which is why that assertion moved to the non-product path.

## Blocking

### 1. B5 — the runbook still promised a boundary, five more times

`evals/README.md`: "Those private outputs are not mounted into the agent container" (`:58`) —
present tense, three lines below the paragraph saying the container is gone. Also `:27`
"Containers need CLAUDE_CODE_OAUTH_TOKEN", `:8` "Two isolated product campaigns", `:85` "These are
isolated, unattended Claude Code trials", `:81` "mounts no plugin".

The B5 test checked three literal strings and caught none of them. **That is the finding behind the
finding:** it tested sentences rather than claims. **Repaired** — the test now matches the shape of
a containment claim, and every line above is rewritten.

### 2. B5 — evidence was being falsified at write time, not merely described

`evals/lib/campaign.mjs:239` **wrote** `Mitigation: disposable container stopped by driver.` into
every incident record under `.aidlc/artifacts/incident/`. Unlike a stale comment, this produces a new
false record on every future run. Also `:15` "each new container sees the new file identity",
`:166` "immutable evidence outside agent mounts", `:321` "Evidence is never mounted in either agent
or product containers". **Repaired** — the record now says the product tree is discarded, which is
what happens.

## Major

### 3. B5 — the source half had no test and no proof row

`stage.mjs:157` `isolateStage`, and `sandbox` as the parameter naming a plain staged directory in
`campaign.mjs:187/335/347`, `comparison.mjs:145`, `run.mjs:253-255`. B5 says "No name … uses
'sandbox' or 'isolation' for something that is neither", and only the two runbooks were asserted.

**Repaired.** `isolateStage` → `stageProduct`; the campaign/comparison/run parameter → `productTree`.
The word survives in exactly one file, `evals/lib/invoker.mjs`, where `sandbox` names the argument
that *triggers* the refusal — there it means "a caller that wanted a boundary", which is accurate.
A new test asserts no declaration names a staged directory a sandbox.

**Two mistakes in the caller's own repair, both caught by the suite and recorded because they are
the interesting part:** the rename changed the key handed to the invoker from `sandbox:` to
`productTree:`, which silently **disabled the refusal** until two tests failed; and the new source
test was over-broad twice, flagging "two isolated installations" (separate installs, not
containment) and three continuation lines of permitted invoke calls.

### 4. B1 — the guard had two holes

`test/no-container.test.mjs`: the extension filter `/\.(mjs|js|json|toml|ya?ml)$/` skipped
extensionless files, so `.aidlc/bin/harness` — where `CLAUDE.md` says all control flow lives — was
never scanned, and a `spawnSync('docker', …)` there would have passed B1 silently. Separately
`spawnSync('/usr/bin/docker', ['run'])` evaded all six patterns. **Repaired**: no extension filter,
and the command pattern matches an absolute path. Excluding `docs/`, `evals/evidence/` and the test
file itself was judged honest and reasoned.

## Minor

### 5. `.aidlc/lib/claude-auth.mjs:14` — unreachable message, unowned file

"Container runs require CLAUDE_CODE_OAUTH_TOKEN" is still reachable via `run.mjs:373`'s
`product: products` and still asserted by `test/claude-auth.test.mjs:54`. **Not in `## Files`**, so
not editable here. Recorded for the human.

### 6. B4 — `--live --products` does not refuse up front

`run.mjs:373+` authenticates, stages every fixture, then fails per-invocation as
`invocation_error`. B4 says "refuses to start, naming plainly". The comparison path got that
treatment; the product path fails later and less clearly. **Not repaired** — the refusal is
correct and total, this is a matter of where the message appears.

### 7-9. Test decoration and remnants

`test/comparison.test.mjs:92`'s new assertion cannot fail (the plugin lives at `s.root/plugin` for
both arms) — harmless, as the real property survives on the next line. `test/invoker.test.mjs:148`
asserts "before the CLI is spawned" without checking it, where the deleted test proved it via the
argv log. `invoker.mjs:119`'s `if (sandbox && …)` is unreachable.

### 10-11. Dead rationale and an overstated proof row — **repaired**

Comments explaining live behaviour by a container that no longer exists (`assertions.mjs:367`,
`stage.mjs:167`, `:187`). And the B4 proof row claimed the test asserts the non-product path still
reaches the CLI; it did not. Rather than edit an approved plan, the row was **made true**: a
conflicting API key makes `requireSubscription` throw, and reaching that throw proves execution got
past the boundary refusal. No process is spawned to prove it.

## The uncertainty item, verified and recorded

**`evals/agent-mechanisms.mjs:140` invokes a real agent with `Write,Edit` (never `Bash`) directly
on the host**, bypassing `evals/lib/invoker.mjs` entirely, and CI runs it at
`.github/workflows/harness.yml:134` behind `workflow_dispatch` with a subscription token. Confirmed
by reading both files. It predates this change, and the spec scopes out "the harness's own
non-product `claude` invocations" — so it is left alone. `docs/OPERATING.md` now states it
explicitly, because "a live product trial refuses to start" must not be misread as "nothing runs an
agent".

## Evidence

- Full suite: 458 tests, 457 pass, 0 fail, 1 skipped (`test/trace-evidence.test.mjs:90`,
  `HARNESS_TRACE_PYTHON`, pre-existing and unrelated)
- `test/no-container.test.mjs`: 6/6
- `--stage stop`: PASS secrets 83ms, PASS test 70358ms

**On two timeouts seen during this work.** `harness check --stage stop` twice reported
`spawnSync bash ETIMEDOUT` (426s, and 1,521s during `--stage commit --all`) while the raw suite
completed normally. Cause identified and measured: this machine's Spotlight indexer (`mds_stores`,
202% CPU) and Microsoft Defender (three processes, ~100% combined) were consuming roughly three
cores, almost certainly indexing the thousands of `mkdtemp` trees the suite creates. Re-runs passed
in 68s and 70s. This is environmental, and it compounds the hardcoded runner timeout already on the
defect list — a loaded machine reads as a missing toolchain.

## Uncertainty

- The evaluator ran nothing in either round; both are read-only inspection over pasted evidence.
- `missingTool` is as strict as before (`status!==0||error`; ENOENT gives `status===null`, which
  satisfied the old `notEqual(status,0)` too) but proves less than the image probe it replaced.
- The repairs in `0c3e660` and `c740fc6` have not themselves been reviewed by an evaluator.
