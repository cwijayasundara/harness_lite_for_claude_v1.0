---
status: draft
---
# Spec: evolving-scope

## Outcome

The eval suite runs multi-sprint campaigns that reveal, without anyone watching, whether the
harness holds when a product's scope arrives one sprint at a time and later sprints contradict
earlier ones.

## Observable behaviours

### B1

Given a campaign task in `evals/tasks.json` with a `steps` array,
When the suite runs it,
Then each step is a separate model invocation against the *same* working copy, in order, and a
step's assertions run before the next step's prompt is given. The runner already does this and no
task uses it; a campaign fixture proves the path works rather than assuming it.

### B2

Given the agent at sprint N,
When it receives that sprint's requirement,
Then it has never seen sprint N+1's requirement in any form — not in the fixture, not in a README,
not in a comment. Asserted structurally: `evals/lib/campaign.mjs` fails the task if any later
step's prompt text appears in the working copy before that step runs.

### B3 — greenfield that becomes brownfield

Given the `campaign-ledger` fixture, which is an empty repository with the harness installed,
When sprint 1 asks for customers and invoices, sprint 2 asks for partial payments, and sprint 3
asks that a paid invoice never appear as overdue,
Then after each sprint every earlier sprint's tests still pass, `harness check --stage stop` is
green, and the working copy contains one slug directory per sprint each with an approved plan
whose `## Files` names what that sprint actually changed.

### B4 — the second sprint edits the first sprint's code

Given sprint 2 of `campaign-ledger`, which cannot be built without changing sprint 1's invoice
model,
When it completes,
Then sprint 1's test file has been *modified rather than replaced*, sprint 1's behaviours that
still apply still have passing tests, and `tamper` records no `deleted-test` finding. An agent
that deletes the inconvenient test and writes a fresh one passes a naive suite and fails this.

### B5 — a contradiction is surfaced, not absorbed

Given sprint 3 of `campaign-ledger`, whose requirement contradicts a behaviour approved in
sprint 1 ("every invoice with a due date in the past is overdue"),
When the agent works,
Then the transcript names the contradiction and the superseded behaviour id before any code
changes, and sprint 1's spec no longer claims the superseded behaviour as current. How that is
recorded is not specified here — an amended spec, a `supersedes:` link, or something the run
suggests. What is specified is that silence fails.

### B6 — the artifacts still describe the code

Given any completed campaign,
When `campaign.mjs` reads every approved spec in the working copy,
Then every `### B<n>` in every approved spec has a test that exercises it, and every test file
traces to a behaviour. A spec that has quietly become fiction is the defect this whole change
exists to find, and it is checkable without a model.

### B7 — brownfield adoption

Given the `campaign-legacy` fixture — a working, untested, artifact-free codebase of about 400
lines with one known defect — and a sprint 1 requirement that adds a feature touching that code,
When the agent works,
Then it characterises the existing behaviour before editing it, the pre-existing behaviour still
holds afterwards, and the first plan's `## Files` names the legacy paths it touched. The known
defect is *not* fixed unless the requirement asked for it: an agent that tidies on the way past
is one whose diffs cannot be reviewed.

### B8 — the first product write in a brownfield repository is possible

Given `campaign-legacy` at sprint 1, where no approved plan exists and `require_contract` is on,
When the agent tries to change product code,
Then it is refused with a message that names the way forward, and the way forward works: writing
the three artifacts, getting the plan approved, and proceeding. If the refusal is a dead end this
behaviour fails, and that is a harness defect rather than a test failure.

### B9 — cost and honesty

Given a campaign,
When it runs,
Then it carries its own USD ceiling per step, a step that exhausts it stops the campaign and the
task is recorded `inconclusive` rather than `fail`, and the suite total respects the run cap in
`.github/workflows/harness.yml`.

### B10 — the defect list is the deliverable

Given the first full campaign run,
When it finishes,
Then its findings are written to `.aidlc/artifacts/evolving-scope/evidence.md`, one entry per
failure with the behaviour it broke and the harness component responsible. No fix lands in this
change. Every entry becomes its own intent, which is Law 11 read literally: the defect comes from
building something, not from reasoning about it.

## Out of scope

- **Fixing anything the campaigns find.** Each finding is its own change with its own gates. A
  change that both discovers and fixes is one that can quietly narrow the discovery to what it
  already fixed.
- **A `supersedes:` field, a product-level accumulated spec, or a `harness adopt` verb.** All
  three are plausible answers to B5 and B7 and all three are guesses until the run says which
  problem is real. Adding one now would be the exact failure this repository was built after.
- **Running campaigns in CI on every push.** They are expensive and slow. They run on request and
  before a release; the 22-task suite stays the per-change gate.
- **Grading the *quality* of the agent's design.** The campaigns assert behaviour, artifacts and
  regressions. Whether the resulting code is well factored is the evaluator's job on a real
  change, not an eval assertion.

## Safeguards

- Campaigns run against staged copies under `mkdtemp`, never against this repository, and the
  existing `stage()` seam already guarantees it.
- A campaign that cannot reach a model is `inconclusive`, never `pass`. The one thing worse than
  an untested harness is a suite that reports green because it did not run.
- No campaign fixture may contain a credential, and the secret scanner runs over fixtures like
  any other path.
- The suite total in `expected.json` grows by the campaigns' cost. That ratchet is deliberate:
  campaigns are the expensive thing, and their cost should be visible rather than folded in.
