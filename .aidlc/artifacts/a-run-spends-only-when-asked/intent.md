---
status: draft
source: docs/LEAN-HARNESS-IMPLEMENTATION-BACKLOG.md
source_revision: 9ee37dcb10f6f0e173d25f600ee81100f02fff76
---
# Intent: a-run-spends-only-when-asked

- **Date:** 2026-09-10
- **Author:** cwijayasundara
- **Source:** backlog item F01, filed at the bound `source_revision`, and the user's direction
  in conversation that this repository must not spend Anthropic API credit.

## Problem

**Four independent paths could select paid API billing, and none of them asked.**

The harness invokes the native `claude` CLI. Which account that CLI bills is decided by the
credential it finds, not by the harness. Every path below let an API credential be the one it
found:

1. `evals/run.mjs` called `loadDotEnv()` automatically, before checking authentication, on both
   the ordinary and comparison paths. `.env` and `.env.*` are gitignored, so a file that supplies
   `ANTHROPIC_API_KEY` can appear in any checkout at any time and be loaded without a word.
   There is no such file in this checkout today, so this is a live mechanism rather than an
   observed charge — the backlog's claim that this repository's `.env` holds a key is not true
   here, and the mechanism is the defect regardless.
2. `claudeAuthenticated()` treated `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or an OAuth token
   as equally acceptable. An API key was not merely permitted, it satisfied the check first and
   the subscription login was never consulted.
3. `evals/lib/invoker.mjs` forwarded `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` and
   `ANTHROPIC_BASE_URL` into the product container alongside the OAuth token, so an isolated trial
   could bill an API account or a gateway.
4. `.github/workflows/harness.yml` ran the live golden suite with `secrets.ANTHROPIC_API_KEY` on
   every pull request whose diff touched a steering surface, capped at USD 5 per suite. This one
   is not latent: it is configured paid evaluation on a trigger no human presses.

**And an ordinary-looking command was a live one.** `node evals/run.mjs` with no arguments ran
the whole golden suite against a model. Nothing in the command said so. The only way to not spend
was to know to pass `--dry`, which is the wrong default for a repository whose owner has said the
API must not be used at all.

Nothing here was hidden or careless — each path was written for a reason, and `.env` loading was
added so that a misleading "no credentials found" message would stop sending people to paste keys
somewhere worse. The reason is sound and the default is still wrong: the harness chose a billing
route on the operator's behalf.

## Proposed outcome

No run reaches for an API credential, and a run that costs anything was asked for by name.

Observable from outside the system:

- An ordinary command makes no model call. Live work requires saying so.
- An API key, auth token, gateway URL or cloud-provider variable causes a refusal before any
  inference, and the refusal names the variable without printing its value.
- No runner loads a repository `.env` into agent authentication.
- The subscription login, or an OAuth token generated for a non-interactive run, is the only
  accepted route, and the confirmed route is reported.
- Ordinary CI needs no model secret. Live CI happens only when a human requests it.
- Every native launch carries a finite bound, and what that bound actually bounds is stated
  honestly rather than implied.

## Affected users and systems

- `evals/run.mjs`, `evals/lib/invoker.mjs`, `evals/agent-mechanisms.mjs` — the three runners that
  launch models.
- `.aidlc/lib/review.mjs` — `harness review` inherits the caller's credentials.
- `.github/workflows/harness.yml` — the configured paid PR trigger.
- Anyone running the suite in a checkout where a `.env` could exist.
- The evaluation policy: removing the PR eval job removes the automatic steering-surface evidence
  that `test/contracts.test.mjs` currently requires.

## Constraints

- No API fallback of any kind, including when subscription quota is exhausted. Refusal is the
  correct behaviour; a paid retry is not.
- Never read, log or print a credential value, in a message or a test assertion.
- Fail closed. An unparseable or unexpected authentication status refuses.
- Zero dependencies. `[limits]` unchanged; no new skill, hook or agent.
- Ordinary tests stay offline and require no Docker change; Docker removal is backlog F18 and not
  this change.
- Sign-in, live verification and hosted-workflow publication are separate states from code
  completion, and none of them may be claimed from an offline test run.

## Open questions

Two decisions are consequential enough to belong to the human, and the spec records a recommended
answer for each rather than leaving them open:

1. **The PR eval gate goes away.** Today a diff touching a steering surface must produce golden
   eval evidence before it can merge, and a missing key fails the job rather than skipping it.
   That job cannot run without a credential, and the only permitted credential is now a
   subscription token that a pull request from a fork must not receive. The recommendation is to
   accept the loss and make live evaluation a requested manual run, recording plainly that
   steering changes now merge without automatic eval evidence. The alternative — keep the job and
   require an OAuth repository secret — narrows rather than closes the exposure and still fails
   for fork PRs.
2. **A 30-turn cap now applies to every launch.** It is the right bound for a one-shot smoke. It
   has never been measured against an independent review of a whole candidate, or against a
   multi-phase product campaign, neither of which had any turn cap before. The recommendation is
   to keep one bound rather than none, make it overridable per call site, and treat the first
   live run that hits it as the evidence for changing it.
