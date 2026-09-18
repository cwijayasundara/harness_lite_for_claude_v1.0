---
status: approved
supersedes: lean-v2#B12
source: docs/LEAN-HARNESS-IMPLEMENTATION-BACKLOG.md
source_revision: 9ee37dcb10f6f0e173d25f600ee81100f02fff76
source_digest: sha256:6d9879fc27a28adc68da23916379110abad0dabf3a61a1e167adf96bfcfdfa5d
source_kind: repository
intent_digest: sha256:b9d4258920517a44b05b875781e8a6faacbc17fbdfc8fad1f6f4d24df5853715
intent_input_digest: sha256:8e8f3238fcccafe5907f8dba64eb624bac3f0e9a9fba104c3cefbfa626f82dab
intent_revision: 6443805674db5c5f11d71393ddb3f3f02d8469cb
by: cwijayasundara
at: 2026-09-10T12:13:01.901Z
digest: sha256:6d7c935dc462550bdfddd94759a508436aa5a96e71d3740868f0b1babcd48883
approval_version: 2
approval_digest: sha256:33fdb4c81a4a0f4195578b0db930d30535a48d8c58ff1afde6206180ae315956
---
# Spec: a-run-spends-only-when-asked

## Outcome

No run reaches for an API credential, and a run that costs anything was asked for by name.

## Requirements

| Source criterion | Behaviour IDs |
|---|---|
| F01: live trials are explicit | B1 |
| F01: rejected API, gateway and provider configuration | B2 |
| F01: verified subscription authentication | B3 |
| F01: no automatic `.env` loading | B4 |
| F01: container credential boundary | B5 |
| F01: settings inheritance and bounded invocation | B6 |
| F01: ordinary PR checks need no model secret | B7 |
| F01: no credential leakage; record unverified cases | B2, B8 |

## Observable behaviours

### B1

Given a checkout with working subscription credentials,
When `node evals/run.mjs` is run with no arguments,
Then no model is invoked, the command exits non-zero, and it says that no model calls were made
and that `--live` requests one. `--dry` continues to validate the task definitions offline, exits
zero, and reads no credentials. The same rule holds for `evals/agent-mechanisms.mjs`: without
`--live` it refuses before doing anything.

The default is refusal. A command that spends must contain the word that asks for it.

### B2

Given any of `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`,
`CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`,
`ANTHROPIC_PROFILE`, `ANTHROPIC_FEDERATION_RULE_ID` or `ANTHROPIC_ORGANIZATION_ID` set in the
environment,
When any path that would launch a model runs,
Then it refuses before inference, names the variables it found, and does not print any part of
their values. The refusal stands even when a valid subscription OAuth token is also present: an
API credential alongside a token must not be resolved in the CLI's favour, because which one wins
is the CLI's decision and not observable from here.

Exhausted subscription quota is also a refusal. There is no API fallback at any point.

### B3

Given no conflicting variable and no OAuth token,
When a live path checks authentication,
Then it consults the `claude` CLI's own status and accepts only a confirmed first-party
subscription: logged in, `apiProvider` first-party, and an authentication method of the Claude
subscription login or an OAuth token. A non-zero exit, unparseable output, a logged-out status, or
an `api_key` authentication method all refuse.

Given a product trial, which runs in a container with no access to a host keychain,
Then `CLAUDE_CODE_OAUTH_TOKEN` is required and its absence refuses, rather than falling back to
any key that happens to be in the environment.

Failure is closed in every direction. Unrecognised authentication is unauthenticated.

### B4

Given a `.env` file in the repository root containing credentials,
When any runner starts,
Then it is not read. The automatic loader is removed from the module rather than left exported and
uncalled, so that a future caller cannot reintroduce it by accident, and this is observable by
importing the runner and finding no such function.

### B5

Given a product trial launched in a container,
When its environment is assembled,
Then only `CLAUDE_CODE_OAUTH_TOKEN` is forwarded across the boundary. API keys, auth tokens and
base URLs are not passed in, whether or not they exist in the launching shell.

### B6

Given any native `claude` launch made by this repository — golden tasks, product trials,
independent review, and the mechanism smoke,
When its arguments are built,
Then they carry `forceLoginMethod` set to the Claude subscription login, merged into any
`--settings` object the call site already supplies rather than replacing it, and a finite
`--max-turns` bound unless the call site set its own.

The forced login method exists because the preflight check and the launch are separate moments:
project settings or an API-key helper could introduce a paid route in between, and the CLI's own
policy is what closes that window.

### B7

Given a push or a pull request,
When the workflow runs,
Then no job references an API-key secret and no job invokes a model. The live job runs only on a
manual dispatch that explicitly requests it, requires a subscription OAuth repository secret, and
when that secret is absent fails with a message saying so rather than passing quietly. A skipped
live job is never evidence that a model behaved well.

### B8

Given a live run that has passed the authentication check,
When it starts,
Then it reports which route was confirmed — subscription login or subscription token — and states
that API billing is disabled and that no repository `.env` was loaded. What the run did is
readable from its own output.

Reported USD figures are labelled as usage estimates, not as charges to an account.

## Design

One module, `.aidlc/lib/claude-auth.mjs`, holds the preflight check, the argument policy and a
launch helper that applies both. The four launch paths call it rather than repeating the rule; the
rule is written once because a copy of it is a copy that will drift. It has no dependencies and
performs no network access of its own — it asks the CLI that will do the spending.

`requireSubscription` returns the confirmed route or throws. Callers that need a boolean wrap it;
`claudeAuthenticated` keeps its existing signature so its callers do not change shape.

**What the bounds actually bound.** `--max-budget-usd` is already passed on every path and is
retained, but under a subscription it constrains a reported usage estimate rather than money, and
the account may still incur charges if usage credits are enabled. The honest bounds on a
subscription run are the turn cap, the process timeout and the operator's own suite caps. This
change states that rather than implying a spend ceiling it cannot enforce.

**Two decisions carried from the intent, recorded here for approval.**

The pull-request golden-suite job is removed, and with it `lean-v2#B12`, which required a steering
change to produce eval evidence before it could merge. That job cannot run under this policy: the
only permitted credential is a subscription token, and a pull request must not be handed one. The
loss is real — steering changes will merge without automatic eval evidence — and is accepted here
rather than worked around. Live evaluation becomes a requested manual run. The deterministic
offline checks remain required on every pull request and are unchanged.

The turn cap is applied uniformly by the argument policy and defaults to 30. That is sized for a
one-shot smoke. It has never been measured against an independent review of a whole candidate, or
against a multi-phase product campaign, neither of which previously had any cap. A call site may
set its own, and the first live run that hits the default is the evidence for changing it. One
bound is preferable to none; the number is provisional and is recorded as such.

## Out of scope

- Removing Docker from the test path — backlog F18.
- Making model selection an operator decision — backlog F03.
- The duplicate `stop` execution inside the commit check — backlog F04.
- Persisting resumable state and pausing cleanly on exhausted quota — backlog F02. This change
  refuses; it does not yet remember where it was.
- Any claim that a Max login works, that a live run succeeded, or that the workflow is published.
  None of those can be established by an offline test, and none is claimed.
- Reviewing the correctness of the source analysis itself. Its factual errors, including the
  claim that this repository holds a `.env` with an API key, are recorded in the intent.

## Safeguards

- **No credential value is ever emitted.** Refusal messages name variables. Tests assert that a
  planted sentinel value does not appear in any output.
- **Existing offline coverage is preserved, not deleted.** The contracts test that asserted the
  old CI policy is rewritten to assert the new one, so the workflow's shape stays under test and
  a future change cannot quietly reintroduce an API-key job.
- **Fixtures under `evals/fixtures/` are untouched.**
- **Zero dependencies; `[limits]` unchanged.** No new skill, hook, agent or control.
- **The eval gate command still exists** and still grades saved results without a model call. Only
  its automatic CI trigger is removed.
