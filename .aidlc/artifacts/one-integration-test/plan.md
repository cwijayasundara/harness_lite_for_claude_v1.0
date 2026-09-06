---
status: approved
by: cwijayasundara
at: 2026-09-06T05:27:19.976Z
digest: sha256:2416e251db875e34d1f0360296e0ad5725ff3550fc63dfcc17d556eab29425f4
---
# Plan: one-integration-test

## Approach

The fixture becomes brownfield by shipping the code sprint 1 used to write. Today sprint 1 builds
`addCustomer` and `addInvoice` from nothing; after this change they already exist, untested, with
`listInvoices` beside them, and sprint 1's prompt asks for the two behaviours that are new
(`outstandingBalance`, `isOverdue`) after characterising what is there. That is what
`campaign-legacy` tested with `renew_loan` over an existing catalog, in the language the ledger
already uses. `src/fees.mjs` is the ledger's `fees.py`: a file with a deliberate defect that no
prompt mentions, asserted byte-identical after every sprint.

Sprints 2 and 3 keep their prompts and assertions, plus the `files_unchanged` line for fees.
Sprint 4 asks for a store split and promises nothing about the contract. Sprint 5 asks for
`docs/PRODUCT.md`. Both are graded on what can be read from the working copy, and everything else
they teach goes to `evidence.md`, because the analysis's A3 said to let the run show what breaks
rather than decide first.

Deleting `campaign-legacy` is a `git rm`, a loop in one test file becoming a single fixture, and
two docs paragraphs. Deleting `../dunning` is an `rm -rf` outside the repository and is the one
step that waits for a spoken yes.

Rejected: keeping `campaign-legacy` for its Python. A language profile the harness never shipped is
what the ledger fixture's own `harness.toml` comment already claims to prove.

Rejected: a sprint 0 that adopts the Python fixture before the ledger sprints. Two languages in one
working copy is a workload nothing else in the repository has, and the brownfield question is the
same in either language.

Rejected: asserting sprint 4 leaves every spec untouched. That would decide A3 before the run.

## Files

- `evals/tasks.json`
- `evals/lib/invoker.mjs`
- `evals/run.mjs`
- `test/evals.test.mjs`
- `evals/fixtures/campaign-ledger/NOTES.md`
- `evals/fixtures/campaign-ledger/src/ledger.mjs`
- `evals/fixtures/campaign-ledger/src/fees.mjs`
- `evals/fixtures/campaign-ledger/tests/smoke.test.mjs`
- `evals/fixtures/campaign-legacy/`
- `test/campaign.test.mjs`
- `docs/OPERATING.md`
- `evals/README.md`
- `.aidlc/artifacts/one-integration-test/`

Amended 2026-09-06, from `a-diff-belongs-to-one-change/evidence.md` F28 and F29, found on the
run that was to prove its B7. Two runner defects stand between this campaign and a green run,
and they are fixed here first because this is the change whose run they would spoil: the eval
agent inherits the developer's user-level plugins (a `brainstorming` skill's approval gate
stopped sprint 2 with a design and no code), and the stored transcript keeps the first 20,000
characters of a campaign, which is the sprint that passed. Steps 0a and 0b below; `test/evals.test.mjs`
carries their proofs.

## Order

0a. `test/evals.test.mjs` — the invoker's argument list contains `--setting-sources` with a value
    that excludes `user`; red, then `evals/lib/invoker.mjs` adds it beside `--plugin-dir`.
0b. `test/evals.test.mjs` — a failing campaign whose steps together exceed the cap stores the
    *last* step's transcript in full; red, then `evals/run.mjs` keeps the tail of each step
    rather than the head of the whole.
1. `evals/fixtures/campaign-ledger/src/ledger.mjs` — `addCustomer(name)` returns a numeric id,
   `addInvoice(customerId, amountCents, dueDate)` throws `Error('unknown customer')` for an id
   not in the map and returns a numeric invoice id, `listInvoices(customerId)` returns that
   customer's invoices as `{ id, customerId, amountCents, dueDate }`. One `Map` for customers, one
   for invoices, module scope. No `outstandingBalance`, no `isOverdue`.
2. `evals/fixtures/campaign-ledger/src/fees.mjs` — `GRACE_DAYS = 3`, `DAILY_RATE_CENTS = 25`,
   `MAX_FEE_CENTS = 1500`, `lateFeeCents(dueDate, paidDate)` with `late < GRACE_DAYS` returning
   zero and `billable = late - GRACE_DAYS + 1`, the same off-by-one `fees.py` carries.
3. `evals/fixtures/campaign-ledger/tests/smoke.test.mjs` — `node:test`, one test importing both
   modules.
4. `evals/fixtures/campaign-ledger/NOTES.md` — what exists, in the shape of `campaign-legacy`'s
   NOTES: customers, invoices, fees, no tests, no artifacts, no claim about the future.
5. `evals/tasks.json` — `campaign-ledger`: `budgetUsd: 1`, `timeoutMs: 360000`, five steps.
   Sprint 1 prompt: "This is an existing invoicing ledger — read NOTES.md first. Add
   `outstandingBalance(customerId)`, the sum of that customer's unpaid invoice amounts, and
   `isOverdue(invoiceId)`, true when an invoice's due date is in the past and false otherwise, to
   `src/ledger.mjs`. In `tests/ledger.test.mjs`, using `node:test`, include tests named
   `test_outstanding_balance_sums_invoices`, `test_add_invoice_requires_known_customer` and
   `test_invoice_past_due_date_is_overdue`. Characterise the existing customer and invoice
   behaviour you rely on before you change anything, including what it throws and when, and do
   not change anything this requirement does not ask for. Follow the harness workflow: intent,
   approved spec, approved plan whose `## Files` names exactly what you touch, red-green
   implementation, `harness check --stage stop` green. You have everything you need — do not ask
   questions." Assertions: `harness_stage_passes: stop`; `transcript_order:
   ["(?i)characteri[sz]", "unknown customer"]`; `file_exists: .aidlc/artifacts/*/plan.md`; the
   three `file_matches` on test names; `files_unchanged: ["src/fees.mjs"]`;
   `unseen_requirements: ["can be partially paid", "must never appear as overdue",
   "src/store.mjs", "docs/PRODUCT.md"]`. Sprints 2 and 3: today's prompts and assertions, each
   plus `files_unchanged: ["src/fees.mjs"]`, sprint 2's `unseen_requirements` gaining
   `"src/store.mjs"` and `"docs/PRODUCT.md"`, sprint 3's gaining the same. Sprint 4 prompt: "Move
   the ledger's in-module storage into `src/store.mjs` so that `src/ledger.mjs` holds only rules
   and imports the store. This is a refactor: no behaviour changes, every existing test keeps
   passing as written, and the public exports of `src/ledger.mjs` are unchanged. Follow the
   harness workflow for it." Assertions: `stop`; `file_exists: src/store.mjs`; `file_matches:
   ["src/ledger.mjs", "from './store.mjs'"]`; `modified_not_replaced` on `tests/ledger.test.mjs`
   with the four test names; `files_unchanged: ["src/fees.mjs"]`; `behaviours_have_tests`;
   `unseen_requirements: ["docs/PRODUCT.md"]`. Sprint 5 prompt: "Write `docs/PRODUCT.md`: a
   short, complete statement of every behaviour the ledger has today, one line per behaviour, as
   a customer would read it. It must be true of the code as it is now. Say at the top which
   sources you used to write it." Assertions: `stop`; `file_matches: ["docs/PRODUCT.md",
   "(?i)partial"]`; `file_matches: ["docs/PRODUCT.md", "(?i)paid[^\\n]*(never|not)[^\\n]*overdue"]`;
   `file_not_matches: ["docs/PRODUCT.md", "(?i)overdue[^\\n]*regardless of[^\\n]*pa(id|yment)"]`.
   Then `node evals/run.mjs --dry` (B7).
6. `git rm -r evals/fixtures/campaign-legacy`; remove the `campaign-legacy` task (B8).
7. `test/campaign.test.mjs` — the loop at line 29 becomes the single fixture, and a new test
   asserts the staged fixture has the B1 files and no `.aidlc/artifacts/`.
8. `docs/OPERATING.md` "Campaigns" section and `evals/README.md` — one campaign, five sprints,
   what each proves, the one command.
9. `node --test test/*.test.mjs`, then `.aidlc/bin/harness check --stage commit`.
10. `node evals/run.mjs --id campaign-ledger --require-auth`. Write
    `.aidlc/artifacts/one-integration-test/evidence.md` (B9), including whatever sprints 4 and 5
    did to the contract chain.
11. With the owner's spoken yes in that session: `rm -rf ../dunning`. Record it in `evidence.md`
    with the date (B8).

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `test/campaign.test.mjs` — the staged fixture contains the four files and no artifacts directory |
| B2 | the sprint 1 row of `.aidlc/artifacts/one-integration-test/evidence.md`, from the run in step 10 |
| B3 | the sprint 2 row of `.aidlc/artifacts/one-integration-test/evidence.md` |
| B4 | the sprint 3 row of `.aidlc/artifacts/one-integration-test/evidence.md` |
| B5 | the sprint 4 row of `.aidlc/artifacts/one-integration-test/evidence.md`, and its finding on the contract |
| B6 | the sprint 5 row of `.aidlc/artifacts/one-integration-test/evidence.md`, and its finding on the sources used |
| B7 | `test/evals.test.mjs` — `validate` accepts `tasks.json`; a test asserts five steps and the two ceilings |
| B8 | `test/campaign.test.mjs` — no `campaign-legacy` fixture or task; `evidence.md` records the `../dunning` deletion |
| B9 | `.aidlc/artifacts/one-integration-test/evidence.md` exists with per-sprint rows |
