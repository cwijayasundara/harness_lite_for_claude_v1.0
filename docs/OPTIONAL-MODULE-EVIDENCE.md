# Phase 5 optional-module decisions

Phase 5 changes one optional module at a time. Completion means recording what the isolated
evidence supports; it does not mean enabling every treatment. Inconclusive or equivalent outcomes
favor the simpler default. The machine-checked record is
`evals/evidence/optional-modules.json`.

| Module | Independent evidence | Decision |
|---|---|---|
| Evaluator review | A live read-only evaluator found a seeded arithmetic defect without changing the checkout. There is no matched human-review-only outcome sample. | Keep optional; its mechanism works, incremental benefit is unmeasured. |
| Graph/map/pack | Six completed pairs per arm produced 33 accepted changes in each arm. Cost per accepted change was about $0.257 with graph and $0.240 without it. | Keep optional; no measured outcome gain pays for the larger surface. |
| Autonomous driver | The bounded native-versus-driver calibration delivered zero accepted changes in either arm; native billing was incomplete and the driver stopped once. | Keep optional; the calibration proves no productivity benefit. |
| Worktree coordination | The deterministic two-engineer integration uses real Git worktrees, preserves independent scope, and catches an integration defect. It has no paired team-productivity comparator. | Keep optional; use native Git isolation by default. |
| Continuous live evals | The workflow exposes explicit live dispatch and bounded scheduling; there is no always-on model loop. | Do not ship continuous execution; retain scheduled/manual evaluation. |

These decisions do not reuse the Phase 4 synthetic fixture as product evidence. The graph row uses
the retained live paired comparison. Evaluator and driver rows retain their actual smoke outcomes,
including incomplete billing and zero acceptance. Worktree and scheduling rows establish mechanics
and operational boundaries only, and say so explicitly.
