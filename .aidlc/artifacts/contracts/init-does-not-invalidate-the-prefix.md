# Delivery contract: init-does-not-invalidate-the-prefix

- **Schema:** aidlc.contract/v1
- **Change id:** init-does-not-invalidate-the-prefix
- **Intent ref:** ../intent-refs/init-does-not-invalidate-the-prefix.json
- **Story ref:** none
- **Risk:** standard
- **Spec status:** approved
- **Spec approval digest:** sha256:7b8db146a1a90f843098dfc98d1da4ad6730536605196f8c1a760e6d405c2c0e
- **Plan status:** approved
- **Plan approval digest:** sha256:49d1b8362031c53350cf1ab07a8611a98d2305645a0bd6b6f5f735928038058d

## Outcome

The cached prompt prefix cannot be invalidated by accident, whichever route is taken to it.

## Observable behaviours

### B1

Given a session in progress,
When a write to `.aidlc/instructions.md` is attempted,
Then it is refused with the cached-prefix reason, as a write to `.claude/CLAUDE.md` already is.

### B2

Given an existing install whose generated files are current,
When `harness init` re-runs,
Then it succeeds silently and changes nothing. Re-running init must stay safe.

### B3

Given an existing install whose `.aidlc/instructions.md` has been changed,
When `harness init` re-runs without `--force`,
Then it refuses, names `.claude/CLAUDE.md` as the cached file it would rewrite, and exits
non-zero without writing.

### B4

Given the same state,
When `harness init --force` runs,
Then it regenerates the file and succeeds. The act stays available; it stops being silent.

### B5

Given a directory with no harness installed,
When `harness init --into` runs,
Then it creates every file and succeeds. A first install creates rather than changes, and must
never be refused.

### B6

Given the `prefix-cache-guard` eval,
When it is re-run,
Then `.claude/CLAUDE.md` is unchanged and the transcript names the reason.

## Out of scope

Whether a project's root `CLAUDE.md` should be generated at all. Any change to what
`renderClaudeInstructions` produces. The `contract-scope-honesty` defect.

## Entities and existing context

- `PREFIX_CACHE_PATHS` (`.aidlc/lib/paths.mjs:61`) — the seven paths the write guard refuses.
  `.aidlc/instructions.md` is missing from it, and is the canonical source of one of them.
- `writeBlocked` (`.aidlc/lib/guard.mjs:45`) — matches those paths by identity and returns the
  cached-prefix message.
- `init` (`.aidlc/bin/harness:164`) — `writeFileSync(L.claudeMd, renderClaudeInstructions(...))`,
  unconditional, through Node rather than the write tool, so no guard observes it.
- `init` also writes `.claude/settings.json` unconditionally, which is the same class of file.
- The 2026-09-02 `prefix-cache-guard` transcript, which is the worked example of the route.

## Approach and rejected alternatives

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

## Structure and ownership

| Path | Change |
|---|---|
| `.aidlc/lib/paths.mjs` | `.aidlc/instructions.md` joins `PREFIX_CACHE_PATHS` |
| `.aidlc/bin/harness` | `init` refuses to change a cached file without `--force` |
| `test/guard.test.mjs` | B1 |
| `test/lifecycle-cli.test.mjs` | B2 to B5 |

## Safeguards

- B2 and B5 pin that install and idempotent re-run still work; a fix that broke either would be
  worse than the defect.
- B4 keeps the act available. The control makes invalidation deliberate, not impossible — the
  same trade the write guard already states.
- The refusal must happen before any write, so a refused `init` leaves the tree untouched.
- No change to the generated content, so a diff in `.claude/CLAUDE.md` after this means the
  source changed, not the renderer.

## Operations

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
