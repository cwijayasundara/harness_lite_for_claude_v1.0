// Turns a draft intent/spec/plan the model just wrote into a committed approval, so the
// next eval step sees the same gate a human would have passed. Never touches artifacts that
// were already in the fixture — those belong to the previous change.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const KINDS = new Set(['intent', 'spec', 'plan']);

export function approveDrafts(work, pristine, kind) {
  if (!KINDS.has(kind)) return { ok: false, detail: `unknown kind "${kind}"` };
  const relDir = `.claude/artifacts/${kind}`;
  const dir = path.join(work, relDir);
  if (!existsSync(dir)) return { ok: false, detail: `no ${relDir}/` };

  const fresh = readdirSync(dir).filter((f) => f.endsWith('.md'))
    .filter((f) => !existsSync(path.join(pristine, relDir, f)));
  if (!fresh.length) return { ok: false, detail: `no new ${kind} artifact` };

  const rels = [];
  for (const f of fresh) {
    const rel = `${relDir}/${f}`;
    const abs = path.join(work, rel);
    const text = readFileSync(abs, 'utf8');
    if (/\*\*Status:\*\*\s*draft\b/.test(text)) {
      writeFileSync(abs, text.replace(/\*\*Status:\*\*\s*draft\b/, '**Status:** approved'));
    } else if (!/\*\*Status:\*\*\s*approved\b/.test(text)) {
      return { ok: false, detail: `${rel} is not draft or approved` };
    }
    rels.push(rel);
  }

  const git = (args) => spawnSync('git', args, { cwd: work, encoding: 'utf8' });
  const add = git(['add', '--', ...rels]);
  if (add.status !== 0) return { ok: false, detail: add.stderr || add.stdout };
  const commit = git(['-c', 'commit.gpgsign=false', 'commit', '-qm', `eval: approve ${kind}`]);
  if (commit.status !== 0) return { ok: false, detail: commit.stderr || commit.stdout || 'commit failed' };
  return { ok: true, detail: rels.join(', ') };
}
