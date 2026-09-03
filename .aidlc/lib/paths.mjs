// The delivery protocol is agent-neutral. Mutable artifacts, state, configuration, and the
// executable live under .aidlc/. Provider directories such as .claude/ are projections only.
import { existsSync } from 'node:fs';
import path from 'node:path';

export function findRepoRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, '.aidlc'))) return dir;
    if (existsSync(path.join(dir, '.claude'))) return dir; // pre-1B compatibility discovery
    if (existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(start);
    dir = up;
  }
}

export function layout(root = findRepoRoot()) {
  const aidlc = path.join(root, '.aidlc');
  const claude = path.join(root, '.claude');
  return {
    root,
    aidlc,
    claude,
    config: path.join(aidlc, 'harness.toml'),
    instructions: path.join(aidlc, 'instructions.md'),
    reviewPolicy: path.join(aidlc, 'policies', 'review.md'),
    claudeMd: path.join(claude, 'CLAUDE.md'),
    artifacts: path.join(aidlc, 'artifacts'),
    intent: path.join(aidlc, 'artifacts', 'intent'),
    spec: path.join(aidlc, 'artifacts', 'spec'),
    plan: path.join(aidlc, 'artifacts', 'plan'),
    contracts: path.join(aidlc, 'artifacts', 'contracts'),
    intentRefs: path.join(aidlc, 'artifacts', 'intent-refs'),
    evidence: path.join(aidlc, 'artifacts', 'evidence'),
    migrations: path.join(aidlc, 'artifacts', 'migrations'),
    review: path.join(aidlc, 'artifacts', 'review'),
    adr: path.join(aidlc, 'artifacts', 'adr'),
    state: path.join(aidlc, 'state'),
    ledger: path.join(aidlc, 'state', 'ledger.jsonl'),
    lastCheck: path.join(aidlc, 'state', 'last-check.json'),
    graph: path.join(aidlc, 'state', 'graph.json'),
    graphDirty: path.join(aidlc, 'state', 'graph-dirty.jsonl'),
    baseline: path.join(aidlc, 'state', 'baseline.json'),
    runId: path.join(aidlc, 'state', 'current-run-id'),
  };
}

// Paths an agent may never write mid-session. Editing any of these invalidates the prompt
// cache prefix for the rest of the session, which is the single most expensive silent
// regression available. Ported from v6, where it was correct and non-obvious.
// lean-v2 B6: `.aidlc/harness.toml` and `.aidlc/model-policy.json` left this list. They are
// registries, not prompt text — neither is read into a session prefix — and guarding them here
// made the agent unable to land its own sealed plan: `dormant-sensors-run-at-commit` owned
// `.aidlc/harness.toml`, the guard refused the write anyway, and the suite stayed red until a
// human typed two lines. A gate that sits inside the build loop is the one the playbook warns
// about. Ownership by a committed approved contract now governs them, which is a human decision
// recorded in git rather than a human keystroke at the end of every registry change.
export const PREFIX_CACHE_PATHS = [
  '.claude/CLAUDE.md',
  '.claude/settings.json',
  '.claude/settings.local.json',
  // The canonical source `.claude/CLAUDE.md` is generated from. Editing it and re-running
  // `harness init` invalidates the cached prefix exactly as editing the generated file would —
  // which is the route a model took on 2026-09-02, respecting the letter of the guard while
  // defeating its purpose.
  '.aidlc/instructions.md',
  '.mcp.json',
  'CLAUDE.md',
];
