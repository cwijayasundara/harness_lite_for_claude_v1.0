// why: contract-planned accepted an out-of-scope edit once committed (item 2 reproduction).
// One explicit boundary for built-in diff sensors; Git failures must reach the runner.
import { execFileSync } from 'node:child_process';

export const git = (root, args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
});

export function resolveCommit(root, ref) {
  if (typeof ref !== 'string' || !ref.trim() || ref.startsWith('-') || ref.includes('\0')) {
    throw new Error('base and candidate must each name a commit');
  }
  return git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
}

export function candidateBoundary(root, base, candidate) {
  return { base: resolveCommit(root, base), candidate: resolveCommit(root, candidate) };
}

export function validateCheckout(root, boundary) {
  if (resolveCommit(root, 'HEAD') !== boundary.candidate) throw new Error('candidate must equal checkout HEAD; check out the candidate before checking');
  if (git(root, ['diff', '--no-ext-diff', '--ignore-submodules=none', '--name-only', '-z', 'HEAD', '--'])) {
    throw new Error('candidate checks require a clean tracked checkout; commit or restore staged and unstaged changes');
  }
}

export const endpoints = cfg => cfg.diff ? [cfg.diff.base, cfg.diff.candidate] : ['HEAD'];
// Preserve onboarding before the first commit without swallowing errors in real diffs.
export function unbornRepository(cfg) {
  if (cfg.diff) return false;
  return git(cfg.layout.root, ['rev-list', '--all', '--max-count=1']).trim() === '';
}
export const diff = (cfg, options, paths = []) => git(cfg.layout.root,
  ['--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', '--ignore-submodules=none', '--no-renames', ...options, ...endpoints(cfg), '--', ...paths]);

export function changedFiles(cfg) {
  const tracked = diff(cfg, ['--name-only', '-z']).split('\0').filter(Boolean);
  const untracked = cfg.diff ? [] : git(cfg.layout.root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  return [...new Set([...tracked, ...untracked])];
}

export function changedStatuses(cfg) {
  const fields = diff(cfg, ['--name-status', '-z']).split('\0');
  const rows = [];
  for (let i = 0; i + 1 < fields.length; i += 2) rows.push({ status: fields[i], file: fields[i + 1] });
  return rows;
}

// Read the committed object, never an untracked file or a symlink target on this machine.
export function candidateFile(cfg, file) {
  return git(cfg.layout.root, ['show', `${cfg.diff.candidate}:${file}`]);
}

export function prChange(body) {
  const lines = String(body ?? '').split(/\r?\n/).filter(line => /^\s*Harness-Change:/i.test(line));
  const match = lines.length === 1 && /^Harness-Change: ([a-z0-9][a-z0-9-]{0,62})\s*$/.exec(lines[0]);
  if (!match) throw new Error('PR description must contain exactly one line: Harness-Change: <change-slug>');
  return match[1];
}
