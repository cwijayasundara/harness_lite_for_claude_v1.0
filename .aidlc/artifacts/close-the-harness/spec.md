---
status: approved
by: cwijayasundara
at: 2026-09-06T15:26:06.352Z
digest: sha256:c2f5a61a04a03ca958d523bfccb7041a1bb9f4dce373dd61314b8a10db21115e
---
# Spec: close-the-harness

## Outcome

Approval is the human's in every attended session, the registry cannot be edited without a plan
that names it, an approved spec's promises cannot grow by amendment, and the golden tasks that
expect files say so. The campaign and the suite run once more and the result is recorded.

## Observable behaviours

### B1 — approval is the human's

Given the pre-bash hook without `AIDLC_UNATTENDED` in its environment,
When the agent runs a command that invokes `harness approve` (in any spelling the `init
--force` rule recognises),
Then it is denied with rule `approve-is-the-humans` and a message saying to ask the human to run
it. A mention of the words in a heredoc or a commit message is not an invocation.

### B2 — the eval runner keeps its approver

Given `AIDLC_UNATTENDED` set, or `AIDLC_EVAL` set,
When the agent runs `harness approve`,
Then B1 does not fire. The runner sets `AIDLC_EVAL` for every task it invokes, campaign or
single prompt, because no eval task has a human; `AIDLC_UNATTENDED` stays what it was, the
campaign-only signal that also changes the approver's identity and the session notice.
Amended 2026-09-06 after the closing suite's first task failed under B1 as first written.

### B3 — the registry is protected by default

Given a repository whose `harness.toml` sets no `protected_paths`,
When the agent writes `.aidlc/harness.toml`,
Then the write is refused by the protected-path rule, and a committed approved plan that names
`.aidlc/harness.toml` still permits it.

### B4 — an approved spec does not grow

Given a spec whose committed text is approved and whose working text adds one or more
`### B<n>` headings,
When `harness approve <slug> spec` runs,
Then it is refused, naming the added ids, and says new behaviours belong in a new change. A
spec with the same or fewer headings is re-approved as today.

### B5 — the interview tasks say what they expect

Given `evals/tasks.json`,
When `contract-is-testable`, `contract-names-owned-files` and `no-secret-commit` are read,
Then each prompt ends with the sentence `intent-not-solution` already carries: the agent has
everything it needs and must not ask questions.

### B6 — the closing runs

Given this change landed,
When `node evals/run.mjs --id campaign-ledger --require-auth` and then `node evals/run.mjs
--require-auth` run once each,
Then their results are recorded in this change's `evidence.md`, `expected.json` is re-recorded
from the full run, and `docs/PROGRAM.md` is deleted.

## Out of scope

- A4, the instruction-surface ablation.
- Any change opened from what the closing runs show.
- Denying `harness approve` to a human. Hooks do not run in a human's shell, and nothing here
  changes that.

## Safeguards

- Every guard, gate and campaign test passes unchanged, apart from the three prompt strings.
- B1's rule is anchored to a command position exactly as `init-force` is, so a quoted mention
  never fires it; the same test shape proves it.
- B3 is a default in `config.mjs`, so an explicit `protected_paths` in a project's registry is
  extended, not replaced.
- B4 reads the committed text through git, the same dependency `isCommitted` already has.
