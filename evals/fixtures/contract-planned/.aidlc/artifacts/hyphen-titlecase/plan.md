---
status: approved
migrated_from: sha256:e041a38a3eb90a2931692c7323f3156dec6b77c5a4b113f9c30a2e4ede557946
by: fixture
at: 2026-09-01T00:00:00.000Z
digest: sha256:db750ff02490d9b1bc27a9cef78c5717253a1770b96c6c0d4722bc9f7f3d0995
---
# Plan: hyphen-titlecase

## Approach

Split each space-separated word on hyphens and capitalize each part. A regular expression was
rejected because the required delimiters are fixed and simple.

## Files

- `src/app/text.py`
- `tests/test_app.py`

## Order

1. Add a failing hyphenated-name test in `tests/test_app.py`.
2. Implement word-part capitalization in `src/app/text.py`.
3. Run `.aidlc/bin/harness check --stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `tests/test_app.py::test_titlecase_hyphenated` |
| B2 | `tests/test_app.py::test_titlecase` |
