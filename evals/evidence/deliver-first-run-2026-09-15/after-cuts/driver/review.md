# Independent review

Base: d334ead962f682baf7d2af7abda1e50a86140476
Candidate: 3e02b7ca16d6a1674664d3311720bfb8d4cd755c
Model: claude-opus-5
Status: complete
Cost USD: 0.335339 (usage estimate, not an invoice)
Export: scoped to 6 files
Checks: run separately; not claimed by this review.

## Review — `ledger-characterize`

**Base** `d334ead` → **Candidate** `3e02b7c`
Inputs used: `candidate.diff`, `candidate/` snapshot, `spec.md` (approved, digest `f274761…`), `plan.md` (approved), `intent.md`.

### Scope and limitations
- **No tests, builds, or commands were run by this reviewer.** All statements about behaviour are from reading `src/ledger.mjs` and `tests/ledger.test.mjs`; nothing below is backed by an observed test run.
- `.claude/harness/policies/review.md` is **not present** in the snapshot, so no finding cites a named pass — every finding cites a behaviour id from `spec.md`.
- The snapshot is partial: `src/fees.mjs` and `NOTES.md` are referenced (`candidate/tests/smoke.test.mjs:6`, `spec.md:4`) but absent. I verified the intent safeguard "keep unrelated late-fee code unchanged" from the diff itself — it touches exactly three files, none of them `src/fees.mjs` — not from the snapshot.
- `candidate/tests/ledger.test.mjs` matches the diff hunk byte-for-byte; no snapshot/diff divergence.

### Suppressions, threshold raises, overridden controls
**None.** The diff introduces no `# noqa`/`eslint-disable`, no skipped or `todo` tests, no threshold or config changes, and no deletion or weakening of pre-existing assertions (`tests/ledger.test.mjs` is a new file; `tests/smoke.test.mjs` is untouched). No existing acceptance criteria were changed. This is the strongest signal in the change and it is clean.

### Blocking
None.

### Important

**1. B3's default `today` parameter is specified but never executed — `plan.md` claims it is proven.**
`spec.md:25` (B3) specifies `today = current UTC YYYY-MM-DD` as part of the approved behaviour. The implementation supplies it at `candidate/src/ledger.mjs:31` via `new Date().toISOString().slice(0, 10)`. Every B3 test passes an explicit date (`tests/ledger.test.mjs:67`, `:73`, `:74`, `:78`), so the default-argument expression is the one line in this change that no test reaches. `plan.md:29` asserts B3 is covered by "External driver runtime acceptance and public regression suite"; for the default-date clause the public suite provides no such proof.

This is an untested path, not an observed defect — reading the code, `toISOString()` is UTC and the `slice(0, 10)` yields `YYYY-MM-DD`, which matches B3. The gap is proof, not correctness. It is cheaply closable without freezing the clock: assert `isOverdue(inv) === true` for a due date far in the past and `=== false` for one far in the future, using the default argument.

### Nits (3)

1. **`CODEBASE-MAP.md` is outside the approved plan's file list.** `plan.md:16-18` names `src/ledger.mjs` and `tests/ledger.test.mjs`; the diff also adds `CODEBASE-MAP.md` (diff lines 1-32). It is a `harness map` generated artifact and harmless, but it is an unlisted file in an approved plan. Its committed content is also partly vacuous — the header claims "4 modules, 7 symbols" while the "Load-bearing modules" table (diff lines 25-27) is empty and "Start here" lists three modules. If the generator is expected to emit an empty hub table at this size, ignore this.

2. **B1's "characterization tests before changes" is unverifiable from this diff.** `spec.md:19` requires characterization tests to land before the change. `tests/ledger.test.mjs:3-9` imports `outstandingBalance` and `isOverdue` in the same file as the B1 tests, so the file cannot execute against base `d334ead`. The final state is fine and the B1 assertions (`:12-36`) genuinely characterize pre-existing behaviour; the ordering claim simply cannot be confirmed from a single squashed commit. Splitting the B1 block into its own file would make the claim checkable. Flagging as uncertainty, not a defect.

3. **`tests/ledger.test.mjs:16` depends on `node:test` running in-file tests sequentially.** `assert.equal(b, a + 1)` holds only if no other test allocates a customer id between the two calls in `:13-14`. That is the runner's default (in-file concurrency 1), so it is correct today; it would break silently if file-level concurrency were ever enabled. Cheap to harden, not worth a change on its own.

### Verified against spec, no finding
- **B1** — `addCustomer`, `addInvoice` (including the `unknown customer` throw) and `listInvoices` are unmodified in `src/ledger.mjs:8-23`; the diff appends only. Characterized at `tests/ledger.test.mjs:12-36`.
- **B2** — `src/ledger.mjs:25-29` sums `amountCents` for the matching `customerId`. All four B2 clauses are covered: sum (`:39`), isolation from other customers (`:46`), empty customer (`:54`), unknown id → `0` (`:59`). Returning `0` rather than throwing for an unknown id is inconsistent with `addInvoice`/`isOverdue`, but `spec.md:22` mandates it explicitly, so it is approved behaviour.
- **B3** — exported function declaration ✓, lexical `dueDate < today` ✓ (`src/ledger.mjs:34`), unknown invoice throws `unknown invoice` ✓ (`:33`, tested `:77`). The `today`-equals-`dueDate` boundary is asserted false at `:73`, which is the correct reading of "before".

---

**changes-requested** — solely for Important #1: add coverage for B3's default `today` argument, or amend `plan.md`'s Proof row for B3 to state that the default-date clause rests on the external driver rather than the public suite. Everything else here is optional. Note that this verdict rests on code reading only; no test execution was performed, so a passing run of the suite would not by itself resolve the finding — the gap is that no test exercises that path.

## Delivery run

Invocation: `1aeed1b9` · wall-clock 122s · USD 0.5480 (usage estimate, not an invoice) · cost per accepted change USD 0.5480 · turns 13 · cache-read share 83% · repairs 1
