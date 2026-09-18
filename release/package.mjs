#!/usr/bin/env node
// Build the publishable plugin as a minimal Git repository. Runtime identity requires an
// immutable commit; a plain tar extraction cannot provide the verified pin consumers enforce.

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const INCLUDE = ['.claude-plugin', '.claude/harness/bin', '.claude/harness/lib',
  '.claude/harness/checks', '.claude/harness/sensors', '.claude/harness/hooks',
  '.claude/harness/hooks.json', '.claude/harness/skills', '.claude/harness/roles',
  '.claude/harness/templates', '.claude/harness/policies', '.claude/harness/schemas',
  '.claude/harness/instructions.md', '.claude/harness/harness.toml',
  '.claude/harness/baseline.json', '.claude/harness/.gitignore'];
export const EXCLUDED_TOP_LEVEL = ['docs', 'evals', 'examples', 'test', '.github', '.claude/worktrees'];

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const optionalGit = (root, ...args) => {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const semver = (value) => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);

function files(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === '.git') continue;
      const absolute = path.join(dir, name);
      if (statSync(absolute).isDirectory()) walk(absolute);
      else out.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out;
}

export function buildPackage({ root = ROOT, out, allowDirty = false } = {}) {
  if (!out) throw new Error('package output directory is required');
  const plugin = JSON.parse(readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
  if (!semver(plugin.version)) throw new Error(`plugin version is not semantic: ${plugin.version}`);
  const sourceCommit = git(root, 'rev-parse', 'HEAD');
  const dirty = git(root, 'status', '--porcelain', '--', ...INCLUDE);
  if (dirty && !allowDirty) throw new Error('runtime package requires clean covered files committed at HEAD');
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const rel of INCLUDE) if (existsSync(path.join(root, rel))) cpSync(path.join(root, rel), path.join(out, rel), { recursive: true });
  for (const excluded of EXCLUDED_TOP_LEVEL) if (existsSync(path.join(out, excluded))) throw new Error(`research path entered package: ${excluded}`);

  const inventory = files(out).map((rel) => ({ path: rel, sha256: sha(readFileSync(path.join(out, rel))) }));
  const release = {
    schema: 'harness.runtime-package/v1', name: plugin.name, version: plugin.version,
    source_commit: sourceCommit, source_dirty_override: Boolean(dirty),
    node: '>=22 <26', claude_code: '>=2.1.263 <3', inventory,
  };
  writeFileSync(path.join(out, 'RELEASE.json'), JSON.stringify(release, null, 2) + '\n');
  git(out, 'init', '-q');
  const origin = optionalGit(root, 'remote', 'get-url', 'origin');
  if (origin) git(out, 'remote', 'add', 'origin', origin);
  git(out, 'add', '-A');
  execFileSync('git', ['-c', 'user.name=Harness Release', '-c', 'user.email=release@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-qm', `release: ${plugin.name} v${plugin.version}`],
  { cwd: out, env: { ...process.env, GIT_AUTHOR_DATE: '2026-09-18T00:00:00Z', GIT_COMMITTER_DATE: '2026-09-18T00:00:00Z' } });
  return { ...release, package_commit: git(out, 'rev-parse', 'HEAD'), out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const at = process.argv.indexOf('--out');
    const out = at === -1 ? null : path.resolve(process.argv[at + 1]);
    console.log(JSON.stringify(buildPackage({ out, allowDirty: process.argv.includes('--allow-dirty') }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
