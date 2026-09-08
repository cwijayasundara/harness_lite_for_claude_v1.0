# Review: clean-project-scaffold

B1: The fresh-install regression asserts exactly eight consumer files and empty artifact/state
directories. Existing tests cover preserving hand-edited files and resolving the shared plugin.
No new standalone copy or provider was introduced.

B2: Before the fix, the current-workflow and maintenance-discovery regressions failed. After the
fix, all three new regressions pass. Maintenance does not create work below the breach threshold
and does not overwrite a human-edited intent. Unsupported deployment template remnants were removed.

B3: Six curated reports were moved with SHA-256 equality checked before and after; historical
spec/plan bodies remain unchanged. Raw eval output is ignored. Eleven generated/retired example
files were removed and three historical Python records archived without modifying their content.
Four delivered intents were closed; two incomplete comparison intents remain open.
Python checks and baseline passed using CI-pinned tools in an isolated uv environment.
TypeScript lint/typecheck/tests and baseline passed with locked dependencies in a temporary copy.
No node_modules directory was added to the harness repository. Both baselines use unchanged
10% tolerance with the corrected installed guidance; this is an intentional baseline revision.
The duplicate Node types manifest key was reconciled to its existing lockfile.

The cache-resolution fixture copied this checkout's generated campaigns and Git history, costing
about 67 seconds. Restricting that copy to runtime/plugin files passed the same assertions in
about 0.3 seconds. This is test-fixture efficiency, not a measured model performance improvement.

No paid model calls or independent whole-change model review were performed. Final local stop
and commit checks and any hosted results are reported in the delivery response.
