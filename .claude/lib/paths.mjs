// Every path the harness writes lives under .claude/. Nothing is scattered across the repo root.
import { existsSync } from 'node:fs';
import path from 'node:path';

export function findRepoRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, '.claude'))) return dir;
    if (existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(start);
    dir = up;
  }
}

export function layout(root = findRepoRoot()) {
  const claude = path.join(root, '.claude');
  return {
    root,
    claude,
    config: path.join(claude, 'harness.toml'),
    claudeMd: path.join(claude, 'CLAUDE.md'),
    artifacts: path.join(claude, 'artifacts'),
    intent: path.join(claude, 'artifacts', 'intent'),
    spec: path.join(claude, 'artifacts', 'spec'),
    plan: path.join(claude, 'artifacts', 'plan'),
    adr: path.join(claude, 'artifacts', 'adr'),
    state: path.join(claude, 'state'),
    ledger: path.join(claude, 'state', 'ledger.jsonl'),
    lastCheck: path.join(claude, 'state', 'last-check.json'),
    graph: path.join(claude, 'state', 'graph.json'),
    graphDirty: path.join(claude, 'state', 'graph-dirty.jsonl'),
    baseline: path.join(claude, 'state', 'baseline.json'),
    runId: path.join(claude, 'state', 'current-run-id'),
  };
}

// Paths an agent may never write mid-session. Editing any of these invalidates the prompt
// cache prefix for the rest of the session, which is the single most expensive silent
// regression available. Ported from v6, where it was correct and non-obvious.
export const PREFIX_CACHE_PATHS = [
  '.claude/CLAUDE.md',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.claude/harness.toml',
  '.mcp.json',
  'CLAUDE.md',
];
