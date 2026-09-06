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
    // One directory per change: .aidlc/artifacts/<slug>/{intent,spec,plan,review}.md. The nine
    // fixed subdirectories this replaced were the contract layout, and `init` kept recreating
    // them empty in every project long after anything read them.
    artifacts: path.join(aidlc, 'artifacts'),
    state: path.join(aidlc, 'state'),
    ledger: path.join(aidlc, 'state', 'ledger.jsonl'),
    lastCheck: path.join(aidlc, 'state', 'last-check.json'),
    graph: path.join(aidlc, 'state', 'graph.json'),
    graphDirty: path.join(aidlc, 'state', 'graph-dirty.jsonl'),
    baseline: path.join(aidlc, 'state', 'baseline.json'),
    runId: path.join(aidlc, 'state', 'current-run-id'),
  };
}

// Steering inputs deserve deliberate edits. Root CLAUDE.md is loaded for a session;
// changing it does not retroactively invalidate the loaded prompt. Reload/restart to apply it.
// Keep the exported name for compatibility; this list protects steering, not cache economics.
export const PREFIX_CACHE_PATHS = [
  '.claude/CLAUDE.md',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.aidlc/instructions.md',
  '.mcp.json',
  'CLAUDE.md',
];
