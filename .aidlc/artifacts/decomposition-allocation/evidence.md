# Preparation evidence — 8 September 2026

Baseline: `4add89e3741e6a652731c488e68140c78900dc0b`, clean working tree on entry.

`node .aidlc/artifacts/decomposition-allocation/reproduce.mjs` exited 0 and asserted
that an independent reporting spec in a disposable product copy was refused solely
for its missing continuity link to the existing title-casing change. See reproduction.json.
The approval attempt was simulated. Protected fixture sources were not edited.

`node .aidlc/bin/harness check --stage stop` exited 0:

```
PASS  secrets     58ms
PASS  test        29546ms
```

`git diff --check` passed. These checks validate preparation against the existing
runtime; they do not demonstrate item 4 acceptance. Only new draft artifacts and
the evolution plan preparation record were written. No production implementation,
approval, hosted review, remote write, merge or deployment is claimed.

Pending: genuine spec and plan decisions; then implementation, migration regressions,
three-child product evidence, full commit/candidate checks and implementation review.
