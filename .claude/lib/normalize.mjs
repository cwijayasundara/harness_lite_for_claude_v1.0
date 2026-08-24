// One finding schema for every language and every tool.
//
// This is the highest-leverage decision in the harness: the agent learns ONE output format
// and never has to know whether a finding came from ruff, eslint, clippy or golangci-lint.
// Adding a language means adding a format name here, not a plugin.
//
//   { file, line, rule, message, fix }

const asFinding = (f) => ({
  file: f.file ?? '', line: f.line ?? 0, rule: f.rule ?? '', message: f.message ?? '', fix: f.fix ?? '',
});

const FORMATS = {
  // ruff check --output-format=json
  ruff(stdout) {
    return JSON.parse(stdout || '[]').map((d) => asFinding({
      file: d.filename, line: d.location?.row, rule: d.code,
      message: d.message, fix: d.fix?.message ?? '',
    }));
  },

  // eslint --format json
  eslint(stdout) {
    const out = [];
    for (const file of JSON.parse(stdout || '[]')) {
      for (const m of file.messages ?? []) {
        out.push(asFinding({ file: file.filePath, line: m.line, rule: m.ruleId, message: m.message, fix: m.fix ? 'autofixable: rerun with --fix' : '' }));
      }
    }
    return out;
  },

  // mypy --output json  (one JSON object per line)
  mypy(stdout) {
    return (stdout || '').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((d) => asFinding({
      file: d.file, line: d.line, rule: d.code ?? 'mypy', message: d.message, fix: d.hint ?? '',
    }));
  },

  // tsc --pretty false   (text: file(line,col): error TSxxxx: msg)
  tsc(stdout) {
    return (stdout || '').split('\n').map((l) => l.match(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/))
      .filter(Boolean).map((m) => asFinding({ file: m[1], line: Number(m[2]), rule: m[3], message: m[4] }));
  },

  // pytest --json-report --json-report-file=-
  pytest(stdout) {
    const start = stdout.indexOf('{');
    if (start === -1) return [];
    const rep = JSON.parse(stdout.slice(start));
    return (rep.tests ?? []).filter((t) => t.outcome === 'failed').map((t) => asFinding({
      file: (t.nodeid ?? '').split('::')[0], line: t.lineno ?? 0, rule: 'test-failed',
      message: t.nodeid, fix: 'fix the code, never the test',
    }));
  },

  // node --test --test-reporter=tap, and anything else that speaks TAP 13. Worth a parser
  // rather than a one-off: TAP is the lowest common denominator across a lot of runners, so
  // this covers node:test, tap, and prove-style suites in one format name.
  tap(stdout) {
    const lines = (stdout || '').split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*not ok \d+ - (.*)$/);
      if (!m) continue;
      let file = '', line = 0, message = m[1].trim();
      // The YAML-ish block that follows carries the location and the reason.
      for (let j = i + 1; j < Math.min(i + 25, lines.length); j++) {
        if (/^\s*not ok |^\s*ok \d+/.test(lines[j])) break;
        const loc = lines[j].match(/^\s*location:\s*'?([^':]+):(\d+)/);
        if (loc) { file = loc[1]; line = Number(loc[2]); }
        const err = lines[j].match(/^\s*error:\s*'?(.+?)'?$/);
        if (err && err[1] !== '|-') message = `${m[1].trim()} — ${err[1]}`;
      }
      out.push(asFinding({ file, line, rule: 'test-failed', message, fix: 'fix the code, never the test' }));
    }
    return out;
  },

  // node --test / vitest / jest --json  -> just surface the tail on failure
  generic() { return []; },
};

export function normalize(format, stdout, stderr, code) {
  const parse = FORMATS[format] ?? FORMATS.generic;
  let findings = [];
  let parseError = '';
  try { findings = parse(stdout); } catch (e) { parseError = e.message; }

  // Generic fallback and parse failures both degrade to a single finding carrying the tail of
  // the tool's own output. A sensor that cannot be parsed must still be able to say "no".
  if (findings.length === 0 && code !== 0) {
    const tail = (stderr || stdout || '').trim().split('\n').slice(-12).join('\n');
    findings = [asFinding({ rule: parseError ? 'harness/unparseable-output' : 'exit-nonzero', message: tail || `exited ${code}` })];
  }
  return findings;
}

export const KNOWN_FORMATS = Object.keys(FORMATS);
