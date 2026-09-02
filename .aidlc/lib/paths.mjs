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
    modelPolicy: path.join(aidlc, 'model-policy.json'),
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
    prompts: path.join(aidlc, 'artifacts', 'prompts'),
    migrations: path.join(aidlc, 'artifacts', 'migrations'),
    handoffs: path.join(aidlc, 'artifacts', 'handoffs'),
    evaluations: path.join(aidlc, 'artifacts', 'evaluations'),
    modelRuns: path.join(aidlc, 'artifacts', 'model-runs'),
    workItems: path.join(aidlc, 'artifacts', 'work-items'),
    workItemReceipts: path.join(aidlc, 'artifacts', 'work-item-receipts'),
    review: path.join(aidlc, 'artifacts', 'review'),
    incident: path.join(aidlc, 'artifacts', 'incident'),
    deployment: path.join(aidlc, 'artifacts', 'deployment'),
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
export const PREFIX_CACHE_PATHS = [
  '.claude/CLAUDE.md',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.aidlc/harness.toml',
  // The canonical source `.claude/CLAUDE.md` is generated from. Editing it and re-running
  // `harness init` invalidates the cached prefix exactly as editing the generated file would —
  // which is the route a model took on 2026-09-02, respecting the letter of the guard while
  // defeating its purpose.
  '.aidlc/instructions.md',
  '.aidlc/model-policy.json',
  '.mcp.json',
  'CLAUDE.md',
];
