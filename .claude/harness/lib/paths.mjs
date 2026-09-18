// Claude Code is the only supported runtime. Mutable artifacts, state, configuration, and the
// executable live under .claude/harness/.
import { existsSync } from 'node:fs';
import path from 'node:path';

export function findRepoRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, '.claude', 'harness'))) return dir;
    if (existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(start);
    dir = up;
  }
}

export function layout(root = findRepoRoot()) {
  const harness = path.join(root, '.claude/harness');
  const claude = path.join(root, '.claude');
  return {
    root,
    harness,
    claude,
    config: path.join(harness, 'harness.toml'),
    instructions: path.join(harness, 'instructions.md'),
    reviewPolicy: path.join(harness, 'policies', 'review.md'),
    claudeMd: path.join(claude, 'CLAUDE.md'),
    rootClaudeMd: path.join(root, 'CLAUDE.md'),
    // One directory per change: .claude/harness/artifacts/<slug>/{intent,spec,plan,review}.md. The nine
    // fixed subdirectories this replaced were the contract layout, and `init` kept recreating
    // them empty in every project long after anything read them.
    artifacts: path.join(harness, 'artifacts'),
    state: path.join(harness, 'state'),
    ledger: path.join(harness, 'state', 'ledger.jsonl'),
    lastCheck: path.join(harness, 'state', 'last-check.json'),
    graph: path.join(harness, 'state', 'graph.json'),
    graphDirty: path.join(harness, 'state', 'graph-dirty.jsonl'),
    baseline: path.join(harness, 'state', 'baseline.json'),
    runId: path.join(harness, 'state', 'current-run-id'),
  };
}

// Steering inputs deserve deliberate edits. Root CLAUDE.md is loaded for a session;
// changing it does not retroactively invalidate the loaded prompt. Reload/restart to apply it.
// Keep the exported name for compatibility; this list protects steering, not cache economics.
export const PREFIX_CACHE_PATHS = [
  '.claude/CLAUDE.md',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.claude/harness/instructions.md',
  '.mcp.json',
  'CLAUDE.md',
];
