// G13. Reading a coverage percentage out of whatever the project's coverage verb produced.
//
// `test_quality` was the control this replaces, and it checked text presence: whether a file that
// looked like a test existed and mentioned something. It never once told anyone their tests had
// stopped covering the code, because it could not — it was a keyword search wearing the name of a
// quality sensor. A percentage that ratchets is a smaller claim and a true one.
//
// Two formats, both already named in `[formats]`: `lcov`, which every JavaScript toolchain and
// node's own test runner emit, and `coverage.py` JSON, which `pytest --cov` emits. Anything else
// returns null — recorded as unmeasured, never invented.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// LF = lines found, LH = lines hit, summed across records. Percent is derived rather than read,
// because lcov has no total line and a per-file average is not a coverage figure.
export function parseLcov(text) {
  let found = 0;
  let hit = 0;
  for (const line of String(text).split('\n')) {
    if (line.startsWith('LF:')) found += Number(line.slice(3)) || 0;
    else if (line.startsWith('LH:')) hit += Number(line.slice(3)) || 0;
  }
  if (!found) return null;
  return Math.round((hit / found) * 10000) / 100;
}

export function parseCoveragePy(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  const percent = data?.totals?.percent_covered;
  if (!Number.isFinite(percent)) return null;
  return Math.round(percent * 100) / 100;
}

// Where a coverage run leaves its report. `{report}` is the path the runner hands the command, so
// it is looked at first; the rest are the conventional locations a tool writes to when the
// project's command names its own destination.
export function reportCandidates(cfg) {
  const command = cfg.capabilities?.coverage ?? '';
  const named = [...command.matchAll(/(?:--test-reporter-destination=|--cov-report=\w+:|-o\s+)([^\s'"]+)/g)].map((m) => m[1]);
  return [
    path.join(cfg.layout.state, 'coverage-report.json'),
    ...named,
    'coverage/lcov.info', 'lcov.info', 'coverage/coverage.json', 'coverage.json',
  ].map((p) => (path.isAbsolute(p) ? p : path.join(cfg.layout.root, p)));
}

// The percentage, or null when the project has no coverage verb, no report, or a format this
// does not read. Null is "unmeasured"; it is never graded as a drop to zero.
export function linesPct(cfg) {
  if (!cfg.capabilities?.coverage?.trim()) return null;
  const format = cfg.formats?.coverage ?? null;
  for (const file of reportCandidates(cfg)) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const parsed = format === 'coverage.py' ? parseCoveragePy(text)
      : format === 'lcov' ? parseLcov(text)
        // No declared format: read whichever the file actually is. A project that configured a
        // coverage command and not its parser should still get a number.
        : (file.endsWith('.json') ? parseCoveragePy(text) : parseLcov(text)) ?? parseLcov(text) ?? parseCoveragePy(text);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
