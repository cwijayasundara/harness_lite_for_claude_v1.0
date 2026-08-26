// Staging: _base, then the fixture on top, then a pristine snapshot to diff against.
// The work copy is a real git repo, because scope-drift and the commit stage read the diff.
import { cpSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'fixtures');

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
  // Install through the real boundary. Hand-building only the shim omitted the inventory record
  // after Phase 1B, so the budget correctly failed every model task on an unaccounted surface.
  const realBin = path.join(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))), '.aidlc', 'bin', 'harness');
  const installed = spawnSync(process.execPath, [realBin, 'init', '--into', work], { cwd: work, encoding: 'utf8' });
  if (installed.status !== 0) throw new Error(`fixture harness install failed: ${installed.stderr || installed.stdout}`);

  const git = (...a) => spawnSync('git', a, { cwd: work, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'eval@harness');
  git('config', 'user.name', 'eval');
  git('add', '-A');
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  cpSync(work, pristine, { recursive: true });
  return { root, work, pristine, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
