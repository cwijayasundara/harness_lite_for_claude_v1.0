---
status: approved
by: cwijayasundara
at: 2026-09-05T05:07:01.992Z
digest: sha256:1094d5916ee94e2e2ee997d00964bf49cfee5409001381449901b04602f52883
---
# Spec: the-suite-measures-this-harness

## Outcome

A full suite run says something true about the harness in the repository today, and a summary line
that reads well cannot hide a suite that has stopped measuring.

## The intent's open questions, answered

**`approved` splits into two questions that were never separate.** A control asking *"is this spec a
promise the code must keep?"* and a gate asking *"may this plan be approved now?"* both read
`status: approved`, and the migration made them disagree. The twenty-three migrated specs carry
`migrated_from: sha256:...`, the digest of a contract that *was* sealed under the previous model —
so treating them as promises is reading the record, not inventing an approval. Treating them as
gateable is not, and must not happen.

So: a spec is a **promise** when its status is `approved` **or** it carries `migrated_from`. A spec
is **gateable** only when its status is `approved`. `lean-v2` refused to invent approvals and was
right; this refuses to pretend the record does not exist, which is a different thing.

**The three stale tasks are repointed, not retired.** Contract testability, ownership of named
files, and successor links all still exist in the three-file chain — they moved from
`.aidlc/artifacts/contracts/<name>.md` to `.aidlc/artifacts/<slug>/{spec,plan}.md`. Each must be
confirmed to still test something the chain does before its assertions are rewritten.

**Ceilings are measured, from a run where the tasks finish.** Not guessed, and not fitted to a run
where four aborted.

## Observable behaviours

### B1 — the tasks describe the harness that exists

Given `contract-is-testable`, `contract-names-owned-files` and `successor-contract-links-first`,
When they run,
Then their assertions name paths the three-file chain actually produces, and each still tests the
property its id claims.

### B2 — a promise and a gate are asked separately

Given a spec carrying `migrated_from` and no approval,
When a control asks whether it is a promise the code must keep,
Then yes; and when `approve` asks whether a plan may be gated against it, then no.

`behavioursHaveTests` and anything else auditing whether artifacts still describe the code reads the
first. `approve` reads the second. A test asserts both directions on the same artifact.

### B3 — the ceilings fit the shape the harness has now

Given a task's `budgetUsd`,
When the task runs to completion,
Then it does not exhaust its ceiling. Each ceiling is set from measured cost with headroom stated in
the commit, and `surgical-fix` at $0.376 is not evidence about a harness where it costs $1.871.

### B4 — a re-baseline records what is true, including what is broken

Given a full run,
When `expected.json` is re-recorded,
Then a task that genuinely fails is recorded `fail`, not smoothed to `pass`, and the commit names
which of the eleven moved tasks were stale assertions, which were budget, and which were real
regressions.

A baseline is a claim about what the suite should do. Re-recording one to make a red suite green is
the failure this change exists to correct, not a shortcut it may take.

### B5 — a cheaper run cannot pass unnoticed

Given a run whose total cost falls while tasks abort on budget,
When the summary is printed,
Then the abort count is visible in the same line as the cost. $8.37 against a $13.76 baseline read
as good news while four tasks were exhausting their ceilings and eleven had moved off `pass`.

### B6 — the gate compares like with like

Given `harness evals gate`,
When the baseline predates the commit under test by a change to the artifact model,
Then it says so rather than reporting the difference as regressions. `expected.json` already records
`commit`; nothing reads it.

## Out of scope

- **Making the eleven moved tasks pass.** Three are stale assertions and four are budget; the rest
  are examined, and any real regression is recorded as `fail` and becomes its own change.
- **Retroactively approving the twenty-three migrated changes.** B2 reads the record that exists.
- **Changing what a campaign asserts.** `evolving-scope` owns that.

## Safeguards

- The re-baseline run must complete without budget exhaustion, or its numbers describe aborts again.
- No task's assertions may be weakened to make it pass. Repointing a path is not weakening;
  deleting an assertion is, and a test that no longer tests its property should be retired loudly
  rather than quietly relaxed.
- `expected.json`'s `commit` and `recorded_at` must be written from the run, never edited by hand.
