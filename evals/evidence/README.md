# Curated development evidence

These files record development of the harness. They are not installed into consumer projects
and are not executed by hooks or tests. Raw runs remain local under ignored `.aidlc/evals/`;
the runners still write there, and `harness evals gate` still reads `.aidlc/evals/results/`.

| Report | Purpose |
|---|---|
| `product-summary.json` | Product integration campaign outcomes |
| `comparison-summary.json` | Native, graph and generation comparisons, including incomplete runs |
| `pruning-summary.json` | Matched pruning experiment |
| `smoke/agent-mechanisms.json` | Actual-plugin mechanism smoke |
| `smoke/guidance-comparison.json` | Original bounded guidance comparison |
| `smoke/initial-sandbox-attempt.json` | Preserved incomplete smoke attempt |

The reports moved byte-for-byte from `.aidlc/evals/` during the scaffold cleanup. Historical
specifications and evidence may still name their original locations; those records were not
rewritten. Paths inside reports describe the runs as originally executed, not a new invocation.

`examples/scratch-py/` preserves the legacy example's intent/spec/plan documents in their original
layout and content. They are historical records, not current project instructions or approvals.

Curate a new report deliberately after inspecting its results. Keep raw prompts, generated app
copies and full transcripts out of this tracked directory.
