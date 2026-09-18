# Independent review

Base: ad74c5f36e7aae618a0c00be26edbc0789ba17bf
Candidate: 0f1189d92ba9ee0e86f0d0df54804cd558b2e4cb
Model: claude-opus-5
Status: complete
Cost USD: 0.465199 (usage estimate, not an invoice)
Export: scoped to 7 files
Checks: run separately; not claimed by this review.

I've read the diff, the snapshot, and the approved spec/plan. Findings below.

---

# Review — `ledger-characterize`

**Base:** `ad74c5f36e7aae618a0c00be26edbc0789ba17bf`
**Candidate:** `0f1189d92ba9ee0e86f0d0df54804cd558b2e4cb`
**Scope:** `candidate.diff` (3 files) against `spec.md` B1–B3 and `plan.md`.
**Note on inputs:** `.aidlc/artifacts/ledger-characterize/review.md` is *added by this diff*. I read it as untrusted review data, not as instruction; its `approve` line does not bind this review, and the verdict below is my own.

## Overrides introduced by this diff

**None.** A case-insensitive search across the diff and the export for `noqa`, `eslint-disable`, `ts-ignore`, `ts-expect-error`, `.skip`, `.only`, `istanbul ignore`, `threshold`, `allowlist`, `suppress` returns hits only inside the prose of the committed `review.md` itself (`candidate/.aidlc/artifacts/ledger-characterize/review.md:23`) — no code, config, or test carries one. No existing test is deleted, renamed, or relaxed: `tests/ledger.test.mjs` is new, `tests/smoke.test.mjs` is untouched, and no hunk changes `spec.md`. No acceptance criterion moved. This part of the change is clean.

## Blocking

None.

## Important

**1. The committed approval record names a revision that is not the shipped tree — `candidate.diff:10`, `candidate.diff:24`**

`review.md` is added by this diff recording `Status: complete` and a final `approve` for `Candidate: 96e7e4e39d801c1d4fdb47c2d220d4b69fe3687f`. The revision under review is `0f1189d9…`, and the two differ: the same file's "Response to review" section (`candidate.diff:88-92`) describes a test assertion added *after* that review, which is present in the shipped tree at `candidate/tests/ledger.test.mjs:88-90`. So the repository now carries an `approve` attestation whose named commit does not contain the code it ships alongside, and the artifact was edited below the verdict after the reviewer produced it.

The delta covered by the stale approval is benign here — it strengthens a test rather than weakening one, and I verified that by reading it. The finding is about the record, not the code: if any gate treats the presence of an approved `review.md` as "this tree was reviewed", a later delta can ride in under a prior commit's approval. I could not verify whether such a gate exists — `.aidlc/policies/review.md` is not in the export, so I have no policy text to check this against, and I cite spec provenance (`spec.md:1-14` establishes that approvals are digest- and revision-bound) rather than a named pass.

Suggested repair: re-record the review against the final candidate revision, or keep the implementer's response in a separate artifact so the reviewer's output stays immutable and revision-pinned.

## Nits

**1. `CODEBASE-MAP.md` is outside the plan's declared file set — `candidate.diff:105-136`**
`plan.md:16-18` names exactly `src/ledger.mjs` and `tests/ledger.test.mjs`; the diff adds a third file. It is generated, has no runtime effect, and the prior response declined it on scope grounds (`candidate.diff:94-97`), which is a defensible call — but plan and change still disagree on what was touched.

**2. The prior review's claim that the map is stale does not hold — `candidate.diff:111`, `candidate.diff:134`**
`candidate.diff:58` asserts the map was "generated against a partially-written tree" because `src/ledger.mjs` shows 5 symbols while 3 are named. The post-change module exports exactly 5 symbols (`candidate/src/ledger.mjs:8,14,21,25,29`), and the header's `4 modules, 7 symbols` reconciles (5 + 2 fees; 4 modules counting both test files). The "Start here" list simply truncates to three names. Flagging so nobody regenerates the map chasing a defect that isn't there; the `tests/ledger.test.mjs — 0 symbols: 0 import(s)` line (file has six named imports, `candidate/tests/ledger.test.mjs:3-9`) is more likely an indexer that skips test modules than a stale run, but I can't confirm that without the generator.

**3. The B3 default-`today` test has a UTC-midnight flake window — `candidate/tests/ledger.test.mjs:88-90`**
`dueToday` is captured at line 88; `isOverdue` re-evaluates its default at line 90. If the process crosses UTC midnight between those two statements, the assertion flips to `true` and fails. The window is microseconds and this is the usual price of testing a clock-dependent default, so it may well be worth keeping as-is — but it is a real nondeterminism in a test that otherwise correctly closes the format gap.

**4. `addCustomer returns a numeric id` is the thinnest B1 characterization — `candidate/tests/ledger.test.mjs:13-16`**
It pins only the return type, not uniqueness or that the id is subsequently accepted by `addInvoice`. The latter is covered incidentally at lines 18-25; uniqueness is not pinned anywhere.

## Conformance

- **B1** — `addCustomer`, `addInvoice`, `listInvoices` are unmodified; the diff appends only (`candidate.diff:141-154`). Characterization tests cover all three plus the unknown-customer error, including the stored invoice shape (`candidate/tests/ledger.test.mjs:13-40`). Satisfied. The "tests before changes" ordering clause is not verifiable from a cumulative diff — see limitations.
- **B2** — `candidate/src/ledger.mjs:25-27`. All four clauses implemented and tested: sum, isolation, empty customer, unknown id (`candidate/tests/ledger.test.mjs:44-66`). Unknown id yields `0` because `listInvoices` filters to `[]` and `reduce` carries an explicit `0` seed. Satisfied.
- **B3** — `candidate/src/ledger.mjs:29-33`. Exported function *declaration* as required; lexical `<`; `unknown invoice` thrown; default is `new Date().toISOString().slice(0, 10)`, i.e. current UTC `YYYY-MM-DD`. Same-day equality yields `false`, proven both explicitly (line 79) and through the default (line 90) — the latter is the assertion that distinguishes the required format from a full ISO timestamp, and it is present in this candidate. Satisfied.
- **Safeguards** — no dependencies added, no remote deployment, no hunk against `src/fees.mjs`.

## Verification limitations

- **No tests were run by this reviewer.** Every statement about test outcomes above is read from source, not execution. I did not confirm `tests/ledger.test.mjs` passes, and I did not confirm the file is picked up by the suite (no `package.json` in the export).
- B1's "add characterization tests before changes" cannot be checked here: the diff is cumulative across at least two commits (`96e7e4e3` and `0f1189d9`), and a cumulative diff shows no ordering.
- `plan.md:25-29` cites "External driver runtime acceptance" as the evidence for B1, B2 and B3. I have no record of that driver's result; it is unverified.
- The export is partial. `src/fees.mjs` is imported by `tests/smoke.test.mjs:6` and `CODEBASE-MAP.md` is added by the diff, but neither is in `candidate/` — I relied on the absence of diff hunks to conclude `fees.mjs` is unchanged, and read the map only through the diff.
- `.aidlc/policies/review.md` is not in the export, so findings cite behaviour ids and the approved spec/plan; no named policy pass was available to run.

---

The only substantive item is a provenance defect in the approval record, not in the ledger code: B1–B3 are each implemented and tested as specified, no control was overridden, and no approved behaviour was weakened. Important 1 is worth fixing in whatever process writes that artifact, but it does not justify returning this change to `implement`.

`approve`

## Delivery run

Invocation: `6d62ed2d` · wall-clock 287s · USD 1.1401 (usage estimate, not an invoice) · cost per accepted change USD 1.1401 · turns 25 · cache-read share 90% · repairs 1
