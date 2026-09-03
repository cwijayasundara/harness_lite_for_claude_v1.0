---
status: draft
migrated_from: sha256:49d1b8362031c53350cf1ab07a8611a98d2305645a0bd6b6f5f735928038058d
---
# Plan: init-does-not-invalidate-the-prefix

## Approach

Close both gaps. `.aidlc/instructions.md` joins `PREFIX_CACHE_PATHS`, so the first step of the
route is refused with the reason. `init` compares what it is about to write against what is
already there, and refuses to change a cached file unless `--force` is given.

Comparing content rather than checking for a session keeps B2 true: an install that is already
current writes nothing and cannot trip the check, which is what "safe to re-run" has always meant.

Rejected: detecting whether a session is in progress. The harness has no reliable signal for it —
`current-run-id` survives the session that wrote it — and a guard that guesses wrong either blocks
a legitimate install or waves through the case it exists for.

Rejected: making `init` refuse always and requiring `--force` every time. It would train everyone
to type `--force` by reflex, which is how a gate becomes decoration.

Rejected: guarding only `.aidlc/instructions.md` and leaving `init` alone. That closes the route
the model actually took and leaves the mechanism intact for the next one — a template change, an
upgrade, a second generated file.

## Files

| Path | Change |
|---|---|
| `.aidlc/lib/paths.mjs` | `.aidlc/instructions.md` joins `PREFIX_CACHE_PATHS` |
| `.aidlc/bin/harness` | `init` refuses to change a cached file without `--force` |
| `test/guard.test.mjs` | B1 |
| `test/lifecycle-cli.test.mjs` | B2 to B5 |

## Order

1. Add `.aidlc/instructions.md` to `PREFIX_CACHE_PATHS`.
2. In `init`, compute the generated content for each cached file, compare with what exists, and
   collect those that would change.
3. If any would change and `--force` is absent, print them with the cached-prefix reason and exit
   non-zero before writing anything.
4. Add B1 to `test/guard.test.mjs` and B2 to B5 to `test/lifecycle-cli.test.mjs`.
5. `harness check --stage commit`, then re-run the `prefix-cache-guard` eval for B6.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/guard.test.mjs` — instructions.md is refused as a cached prefix |
| B2 | `test/lifecycle-cli.test.mjs` — the existing idempotence test, unchanged |
| B3 | `test/lifecycle-cli.test.mjs` — a changed source makes init refuse and write nothing |
| B4 | `test/lifecycle-cli.test.mjs` — `--force` regenerates |
| B5 | `test/lifecycle-cli.test.mjs` — the existing first-install path, unchanged |
| B6 | the `prefix-cache-guard` eval verdict after the change |
