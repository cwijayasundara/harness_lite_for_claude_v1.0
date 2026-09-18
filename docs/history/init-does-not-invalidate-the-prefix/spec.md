---
status: draft
migrated_from: sha256:7b8db146a1a90f843098dfc98d1da4ad6730536605196f8c1a760e6d405c2c0e
---
# Spec: init-does-not-invalidate-the-prefix

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

## Safeguards

- B2 and B5 pin that install and idempotent re-run still work; a fix that broke either would be
  worse than the defect.
- B4 keeps the act available. The control makes invalidation deliberate, not impossible — the
  same trade the write guard already states.
- The refusal must happen before any write, so a refused `init` leaves the tree untouched.
- No change to the generated content, so a diff in `.claude/CLAUDE.md` after this means the
  source changed, not the renderer.

## Entities and existing context

- `PREFIX_CACHE_PATHS` (`.aidlc/lib/paths.mjs:61`) — the seven paths the write guard refuses.
  `.aidlc/instructions.md` is missing from it, and is the canonical source of one of them.
- `writeBlocked` (`.aidlc/lib/guard.mjs:45`) — matches those paths by identity and returns the
  cached-prefix message.
- `init` (`.aidlc/bin/harness:164`) — `writeFileSync(L.claudeMd, renderClaudeInstructions(...))`,
  unconditional, through Node rather than the write tool, so no guard observes it.
- `init` also writes `.claude/settings.json` unconditionally, which is the same class of file.
- The 2026-09-02 `prefix-cache-guard` transcript, which is the worked example of the route.
