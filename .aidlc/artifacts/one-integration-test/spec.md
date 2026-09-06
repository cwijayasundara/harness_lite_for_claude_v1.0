---
status: draft
supersedes: lean-v2#B13
---
# Spec: one-integration-test

## Outcome

One command runs one campaign against one fixture, and its green is the statement that the harness
works across a product's whole arc: adoption, extension, contradiction, refactor, and description.

## Observable behaviours

### B1 — one fixture, brownfield

Given `evals/fixtures/campaign-ledger/`,
When it is staged,
Then it contains a working, untested, artifact-free ledger: `src/ledger.mjs` exporting
`addCustomer(name)`, `addInvoice(customerId, amountCents, dueDate)` and `listInvoices(customerId)`
over an in-module `Map`; `src/fees.mjs` exporting `lateFeeCents(dueDate, paidDate)` with a grace
period and one deliberate off-by-one that no sprint asks about; `tests/smoke.test.mjs` that only
imports both; `NOTES.md` describing what exists and claiming nothing about what it should become;
and `.aidlc/harness.toml` as today. No `.aidlc/artifacts/`.

### B2 — sprint 1 adopts before it extends

Given the staged fixture and sprint 1's prompt,
When the sprint completes,
Then `stop` passes, a `plan.md` exists, `tests/ledger.test.mjs` contains
`test_outstanding_balance_sums_invoices`, `test_add_invoice_requires_known_customer` and
`test_invoice_past_due_date_is_overdue`, `src/fees.mjs` is byte-identical to the fixture, the
transcript characterises existing behaviour before the first product write, and no later sprint's
requirement text appears in the working copy.

### B3 — sprint 2 extends without replacing

Given sprint 1's working copy and sprint 2's prompt,
When the sprint completes,
Then the assertions `campaign-ledger` sprint 2 carries today hold unchanged, and `src/fees.mjs` is
still byte-identical to the fixture.

### B4 — sprint 3 contradicts and records it

Given sprint 2's working copy and sprint 3's prompt,
When the sprint completes,
Then the assertions `campaign-ledger` sprint 3 carries today hold, `src/fees.mjs` is unchanged,
and, once `a-diff-belongs-to-one-change` lands, every product file changed in the sprint is named
by the current change's plan.

### B5 — sprint 4 is a pure refactor

Given sprint 3's working copy and a prompt to move the in-module store into `src/store.mjs` with
no behaviour change and every existing test kept passing as written,
When the sprint completes,
Then `stop` passes, `src/store.mjs` exists, `src/ledger.mjs` still exports the four functions,
`tests/ledger.test.mjs` still contains all four earlier test names, `src/fees.mjs` is unchanged,
and `behaviours_have_tests` holds. What the sprint did to the contract is recorded in
`evidence.md` as a finding, whichever way it went.

### B6 — sprint 5 states the product

Given sprint 4's working copy and a prompt to write `docs/PRODUCT.md` stating every behaviour the
ledger has today,
When the sprint completes,
Then `docs/PRODUCT.md` exists, mentions partial payment, mentions that a paid invoice is never
overdue, and does not state sprint 1's superseded claim as current. Whether the agent derived it
from the artifact chain or from the code is recorded in `evidence.md`.

### B7 — the campaign is bounded

Given `evals/tasks.json`,
When `node evals/run.mjs --dry` validates it,
Then `campaign-ledger` has five steps, `budgetUsd` is at most one dollar per sprint, `timeoutMs`
is at most six minutes per sprint, and no other task has `steps`.

### B8 — the others are gone

Given the repository after this change,
When `git ls-files evals/fixtures` runs,
Then no path starts with `evals/fixtures/campaign-legacy/`; `evals/tasks.json` has no task
`campaign-legacy`; `test/campaign.test.mjs` iterates one fixture; and `docs/OPERATING.md` and
`evals/README.md` describe one campaign. `../dunning` no longer exists on disk, recorded in
`evidence.md` with the date.

### B9 — the run's findings go to evidence

Given the first full five-sprint run,
When it completes,
Then `.aidlc/artifacts/one-integration-test/evidence.md` records verdict, cost and wall clock per
sprint, and one entry per finding naming the behaviour and component, in the shape
`evolving-scope/evidence.md` uses.

## Out of scope

- **A derived product spec, a `sync` verb, or any mechanism for backward sync.** B5 and B6 collect
  the evidence the analysis's A3 asked for. Deciding is the next intent's job.
- **Carrying `campaign-legacy`'s Python over.** The Python fixture's job was brownfield adoption
  and a file that must stay untouched. B1 and B2 do both in Node.
- **Running the campaign in CI.** It stays a pre-release command, as `docs/OPERATING.md` says.
- **Re-baselining `expected.json`.** That is `the-suite-measures-this-harness`.

## Safeguards

- Fixtures are protected paths. Every fixture file this change writes is named in the plan's
  `## Files`, and nothing else under `evals/fixtures/` changes.
- Sprint prompts 2 and 3 keep their wording, so the sprint 2 and 3 evidence already recorded stays
  comparable.
- `unseen_requirements` for sprints 1 through 4 name the phrases of every later sprint, so a
  leaked requirement is still caught.
- Deleting `../dunning` happens only after the owner says so in the session that does it. It is
  outside this repository and has no remote.
