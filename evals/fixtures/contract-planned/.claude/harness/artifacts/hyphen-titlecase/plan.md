---
status: approved
migrated_from: sha256:e041a38a3eb90a2931692c7323f3156dec6b77c5a4b113f9c30a2e4ede557946
by: fixture
at: 2026-09-01T00:00:00.000Z
digest: sha256:106b1ac34357db14ca9e006ec57ed7fdd6744464fce7e73e324d88c2d9e19088
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
3. Run `.claude/harness/bin/harness check --stage commit`.

## Proof

| Behaviour | Test or evidence |
|---|---|
| B1 | `tests/test_app.py::test_titlecase_hyphenated` |
| B2 | `tests/test_app.py::test_titlecase` |
