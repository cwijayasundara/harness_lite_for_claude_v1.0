---
status: approved
spec_digest: sha256:6d7c935dc462550bdfddd94759a508436aa5a96e71d3740868f0b1babcd48883
spec_approval_digest: sha256:33fdb4c81a4a0f4195578b0db930d30535a48d8c58ff1afde6206180ae315956
by: cwijayasundara
at: 2026-09-10T12:23:15.939Z
digest: sha256:3a88a6d3faf5696f43e695fca1a6c8f0dec57f384885aa330d5b84865f232d13
approval_version: 2
approval_digest: sha256:70c73abdd0e0a54cc1ed8cdabc8062eb6477435ec6b8eceadbc8aa98bc090b76
---
# Plan: a-run-spends-only-when-asked

## Approach

The rule is written once, in a new zero-dependency module, and the four launch paths call it.
Repeating a credential rule at four call sites is how three of them end up one revision behind the
fourth, which is close to how this defect arose: `claudeAuthenticated` and the invoker's
credential-forwarding list already disagreed about what counted as authentication.

`.aidlc/lib/claude-auth.mjs` exposes three things. `requireSubscription` is the preflight: it
refuses on any conflicting variable, otherwise accepts a token or a confirmed first-party login,
and returns the route it confirmed. `subscriptionArgs` is the argument policy: it merges
`forceLoginMethod` into whatever `--settings` the call site already built and adds a turn bound if
the call site set none. `runSubscriptionClaude` applies both and spawns. Callers that need a
boolean rather than a throw wrap it, so `claudeAuthenticated` keeps its signature and its callers
do not change shape.

Preflight and launch are separate moments, which is why both exist. The preflight reads the
environment the harness controls; `forceLoginMethod` closes the window in which project settings
or an API-key helper could introduce a paid route after the check has passed. Neither alone is
sufficient and the pair is cheap.

Most of this code is already written in the working tree, from the session that diagnosed the
problem. The work here is to finish it against the approved behaviours rather than to rewrite it:
five of the eight behaviours have no proof or only partial proof, and B5 and B8 have none at all.
An implementation with no failing test behind it is the thing this repository exists to refuse.

The alternative considered and rejected: leave the `.env` loader and gate it behind a flag. It
keeps the helpful error message that motivated it, and it fails B4 — a loader that can be reached
is a loader that will be reached, and the message can be written without reading the file.

## Files

- `.aidlc/lib/claude-auth.mjs`
- `.aidlc/lib/review.mjs`
- `evals/run.mjs`
- `evals/lib/invoker.mjs`
- `evals/agent-mechanisms.mjs`
- `.github/workflows/harness.yml`
- `test/claude-auth.test.mjs`
- `test/autogate.test.mjs`
- `test/contracts.test.mjs`
- `test/evals.test.mjs`
- `test/invoker.test.mjs`
- `README.md`
- `docs/OPERATING.md`
- `evals/README.md`
- `CODEBASE-MAP.md`

## Order

1. `.aidlc/lib/claude-auth.mjs` — confirm the guard covers all nine variables named in B2, and
   that unparseable and non-zero CLI status refuse. Extend `test/claude-auth.test.mjs` to plant a
   sentinel value for every one of the nine and assert it appears in no output.
2. `test/claude-auth.test.mjs` — add the `--max-turns` case where the call site supplies its own
   bound and it is preserved, completing B6.
3. `evals/run.mjs` — the loader is removed, `--live` is required, and the confirmed route is
   reported. `test/evals.test.mjs` proves the loader is gone by import.
4. `test/claude-auth.test.mjs` — B8: with a stub `claude` on `PATH` answering a confirmed
   subscription status, a `--live` run reports the route, that API billing is disabled and that no
   `.env` was loaded. Follows the stub pattern already in `test/autogate.test.mjs`.
5. `evals/agent-mechanisms.mjs` — refuse without `--live` with a printed message and a non-zero
   exit rather than a thrown stack, matching the runner. Add its refusal case to
   `test/claude-auth.test.mjs`, completing B1.
6. `evals/lib/invoker.mjs` — preflight before launch, subscription arguments, and only
   `CLAUDE_CODE_OAUTH_TOKEN` across the container boundary. B5 needs a stub `docker` on `PATH`
   that records its argv; assert the OAuth variable is forwarded and that no API key, auth token
   or base URL is, with all four set in the launching environment.
7. `.aidlc/lib/review.mjs` — the default invocation goes through the guard. Existing injected-fake
   tests must still pass unchanged, which is the check that the seam was not moved.
8. `.github/workflows/harness.yml` — no API-key secret anywhere, the live job only on an explicit
   manual dispatch, a missing OAuth secret an error. `test/contracts.test.mjs` asserts the new
   shape in place of the old.
9. `README.md`, `docs/OPERATING.md`, `evals/README.md` — every documented command that now needs
   `--live` gets it, and the USD figures are labelled as usage estimates.
10. `CODEBASE-MAP.md` — regenerate with `harness map` so the new module is indexed.

Steps 1 to 8 are ordered by dependency; 9 and 10 follow the code.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/claude-auth.test.mjs::ordinary runner invocation and dry validation never launch a live trial` extended to cover `evals/agent-mechanisms.mjs` refusing without `--live` |
| B2 | `test/claude-auth.test.mjs::subscription guard rejects API, gateway and provider credentials before invoking Claude`, extended to all nine variables with a sentinel value asserted absent from output |
| B3 | `test/claude-auth.test.mjs::only confirmed subscription status or a dedicated OAuth token is accepted`, extended with unparseable output and a non-zero CLI exit; `test/evals.test.mjs::authentication follows Claude CLI status, including keychain-backed logins` |
| B4 | `test/evals.test.mjs::the live runner no longer exposes an automatic dotenv credential loader` |
| B5 | new case in `test/invoker.test.mjs`: a stub `docker` records argv; only `CLAUDE_CODE_OAUTH_TOKEN` is forwarded with all four credential variables set |
| B6 | `test/claude-auth.test.mjs::CLI subscription enforcement preserves existing settings and bounds turns`, extended with a call site that sets its own `--max-turns`; `test/invoker.test.mjs::invoker: builds the argv the CLI expects and extracts usage from its JSON` |
| B7 | `test/contracts.test.mjs::live CI is manual, subscription-only, and missing OAuth fails explicitly` and `::CI live smoke uses a subscription secret only on its explicit run step` |
| B8 | new case in `test/claude-auth.test.mjs`: a stubbed confirmed login reports the route, API billing disabled, and no `.env` loaded |

Runtime proof beyond the suite: `node evals/run.mjs` and `node evals/run.mjs --dry` are run by hand
and their output pasted, because B1 is a claim about what an operator sees. No live model call is
made, and nothing about a working Max login or a published workflow is claimed from this change.
