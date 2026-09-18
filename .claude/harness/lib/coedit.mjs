// The co-edit edge: files that change together, from git history.
//
// why: `import` and `call` see structure and nothing else. Over the last 400 commits
// `test/guard.test.mjs` and `test/lifecycle-cli.test.mjs` changed together nine times with no
// import or call edge between them — a dependency the structural graph cannot express and an
// agent changing one of them has no way to learn.
//
// The only part of the index that shells out to git, so it lives alone and returns an empty set
// on any failure: no history, a shallow clone, a git that is not installed. Absent, never wrong.

import { execFileSync } from 'node:child_process';

// Constants, not settings. A knob here is a knob nobody tunes, and a window that varies between
// machines makes two indexes of the same tree disagree.
//
// WINDOW is what the measurement covers: ~270 ms warm on this repository, paid once per commit
// rather than once per rebuild — see `coeditFor`'s caller, which reuses the previous result while
// HEAD has not moved.
const WINDOW = 400;
// A commit touching more files than this contributes nothing. The largest commit in this
// repository's window touched 164 files; treating that as 13,366 pairwise dependencies would
// manufacture a clique out of one bulk edit and drown every real signal in it.
const MAX_FILES_PER_COMMIT = 50;
// A pair that changed together exactly once has not demonstrated coupling; it has demonstrated a
// coincidence. B4 asks for a weight that reflects how often rather than merely whether, and one
// occurrence is merely whether.
//
// MEASURED: 503 of this repository's 750 raw pairs are weight-1, so the threshold removes two
// thirds of the edge set and none of its signal. It also disposes of the degenerate case the
// file-count cap cannot see — a repository whose whole tree arrives in one initial commit, where
// every file has "changed with" every other exactly once and the result is a clique.
const MIN_WEIGHT = 2;

export function head(root) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

// Returns { [fileA]: [[fileB, weight], ...] } with each pair recorded once, on its
// lexicographically smaller end. Only files the index already knows about take part: a co-edit
// edge to something that is not a module is not an edge anyone can follow.
export function coedit(root, known) {
  let out;
  try {
    out = execFileSync('git', ['log', `-${WINDOW}`, '--name-only', '--format=%H', '--no-renames'],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return {}; }

  const pairs = new Map();
  let files = [];
  const flush = () => {
    if (files.length > 1 && files.length <= MAX_FILES_PER_COMMIT) {
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          const [a, b] = files[i] < files[j] ? [files[i], files[j]] : [files[j], files[i]];
          const key = `${a}\0${b}`;
          pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
      }
    }
    files = [];
  };

  for (const line of out.split('\n')) {
    if (!line) continue;
    if (/^[0-9a-f]{40}$/.test(line)) { flush(); continue; }
    if (known.has(line)) files.push(line);
  }
  flush();

  const edges = {};
  for (const [key, weight] of pairs) {
    if (weight < MIN_WEIGHT) continue;
    const [a, b] = key.split('\0');
    (edges[a] ??= []).push([b, weight]);
  }
  for (const list of Object.values(edges)) list.sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  return edges;
}
