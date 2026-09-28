# Curated development evidence

These files record development of the harness. They are not installed into consumer projects
and are not executed by hooks or tests. Raw runs remain local under ignored `.claude/harness/evals/`;
the runners still write there, and `harness evals gate` still reads `.claude/harness/evals/results/`.

| Report | Purpose |
|---|---|
| `g24-calculator-pilot-2026-09-28.json` | Calculator pilot after the intent audit, one run per arm |
| `comparison-summary.json` | Native, graph and generation comparisons, including incomplete runs |
| `smoke/agent-mechanisms.json` | Actual-plugin mechanism smoke |

The reports moved byte-for-byte from `.claude/harness/evals/` during the scaffold cleanup. Historical
specifications and evidence may still name their original locations; those records were not
rewritten. Paths inside reports describe the runs as originally executed, not a new invocation.

Earlier curated runs, and the legacy `examples/scratch-py/` records, are archived at the tag
`archive/history-2026-09-28`.

Curate a new report deliberately after inspecting its results. Keep raw prompts, generated app
copies and full transcripts out of this tracked directory.
