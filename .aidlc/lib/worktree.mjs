import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const safe = (value) => typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(value);

export function addWorktree(root, slug) {
  if (!safe(slug)) throw new Error('slug must be a canonical slug');
  const dest = path.join(path.dirname(root), `${path.basename(root)}-${slug}`);
  if (existsSync(dest)) throw new Error(`worktree already exists at ${dest}`);
  mkdirSync(path.dirname(dest), { recursive: true });
  const result = spawnSync('git', ['worktree', 'add', dest, '-b', `harness/${slug}`], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'git worktree add failed').trim());
  return { dest, branch: `harness/${slug}` };
}
