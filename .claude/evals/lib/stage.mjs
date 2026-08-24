// Staging: _base, then the fixture on top, then a pristine snapshot to diff against.
// The work copy is a real git repo, because plan-drift and the commit stage read the diff.
import { cpSync, mkdtempSync, existsSync, rmSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'evals', 'fixtures');

export function stage(fixturesDir, name) {
  const base = path.join(fixturesDir, '_base');
  const fx = path.join(fixturesDir, name);
  if (!existsSync(fx)) throw new Error(`no fixture "${name}" in ${fixturesDir}`);
  const root = mkdtempSync(path.join(tmpdir(), `eval-${name}-`));
  const work = path.join(root, 'work');
  const pristine = path.join(root, 'pristine');
  cpSync(base, work, { recursive: true });
  cpSync(fx, work, { recursive: true });
  rmSync(path.join(work, 'README.md'), { force: true });
  // Fixtures get the same `.claude/bin/harness` shim `harness init` writes, so the command
  // CLAUDE.md documents actually exists — otherwise the eval measures a broken install.
  const realBin = path.join(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))), '.claude', 'bin', 'harness');
  mkdirSync(path.join(work, '.claude', 'bin'), { recursive: true });
  const shim = path.join(work, '.claude', 'bin', 'harness');
  writeFileSync(shim, `#!/usr/bin/env bash\nexec node ${JSON.stringify(existsSync(realBin) ? realBin : path.join(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))), 'bin', 'harness'))} "$@"\n`);
  chmodSync(shim, 0o755);

  const git = (...a) => spawnSync('git', a, { cwd: work, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'eval@harness');
  git('config', 'user.name', 'eval');
  git('add', '-A');
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  cpSync(work, pristine, { recursive: true });
  return { root, work, pristine, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
