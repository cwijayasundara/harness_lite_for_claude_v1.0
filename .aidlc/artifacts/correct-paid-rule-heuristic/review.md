# Review: paid-rule documentation heuristic

The saved candidate explicitly states that a fully paid invoice returns false for overdue
status. Product API verification had passed before the phrase heuristic rejected that text.
This was an observer false block, not a product regression. The narrow conditional matcher now
accepts the exact saved wording; contrary true-return and not-fully-paid variants stay rejected.
All twenty comparison tests passed, and regrading the original saved document passed.
No fixture or private API assertion changed. The heuristic remains supporting evidence, not a
semantic documentation proof. The original rejected candidate, unnecessary repair and live
cost remain recorded. No independent whole-change model review is claimed.
