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

// Observations, not assertion-quality judgments. Do not infer execution from file presence
// or a command's exit code. Keep unsupported/malformed output explicitly unverified.
export function testExecution(format, payload) {
  if (format !== 'pytest') return { status: 'unsupported', tests: [] };
  try {
    const report = JSON.parse(payload);
    if (!report || !Array.isArray(report.tests) || !Number.isInteger(report.exitcode)) throw new Error('invalid pytest report');
    const tests = report.tests.map(t => {
      if (typeof t.nodeid !== 'string' || !t.nodeid.includes('::') || !['passed', 'failed', 'skipped', 'error', 'xfailed', 'xpassed'].includes(t.outcome)) throw new Error('invalid test observation');
      // pytest-json-report includes setup/call/teardown. An overall "passed" without a
      // successful call phase is not evidence that the named test body executed.
      const outcome = t.outcome === 'passed' && !['setup', 'call', 'teardown'].every(phase => t[phase]?.outcome === 'passed') ? 'unverified' : t.outcome;
      return { nodeid: t.nodeid, outcome };
    });
    return { status: 'observed', exitcode: report.exitcode, tests };
  } catch { return { status: 'malformed', tests: [] }; }
}

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
      message: t.nodeid, fix: 'diagnose against the approved behaviour; preserve regression proof when fixing code or tests',
    }));
  },

  // node --test --test-reporter=tap, and anything else that speaks TAP 13. Worth a parser
  // rather than a one-off: TAP is the lowest common denominator across a lot of runners, so
  // this covers node:test, tap, and prove-style suites in one format name.
  tap(stdout) {
    const lines = (stdout || '').split('\n');
    const out = [];
    // why: a test check that runs zero tests reports PASS. bash passes an unmatched glob
    // through literally, `node --test <nonexistent>` emits a well-formed empty report and
    // exits 0, and runner.mjs reads exit 0 + no findings as success. A stale glob in
    // [checks].test once left `--stage stop` printing PASS in 31ms against a ~10s suite.
    // Anchored to column 0: nested subtests indent their own plan lines.
    if (/^1\.\.0\s*$/m.test(stdout || '') || /^# tests 0\s*$/m.test(stdout || '')) {
      return [asFinding({
        rule: 'harness/empty-suite',
        message: 'the test command ran no tests — a suite that executed nothing has not demonstrated anything',
        fix: 'check the [checks] command in harness.toml: an unmatched glob is passed through literally by bash and exits 0',
      })];
    }
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
      out.push(asFinding({ file, line, rule: 'test-failed', message, fix: 'diagnose against the approved behaviour; preserve regression proof when fixing code or tests' }));
    }
    return out;
  },

  // G14. Mutation testing, in the mutation-testing-elements JSON schema — what Stryker writes and
  // what every other emitter in that ecosystem targets. A surviving mutant is the finding: the
  // suite ran, the code changed, and nothing noticed. `NoCoverage` is reported too and says
  // something different in the same breath — no test even executed that line.
  //
  // Deliberately one schema rather than one parser per tool: a mutation tool that cannot emit it
  // writes `{report}` in it, which is a smaller ask than a parser this repository cannot test.
  mutation(stdout) {
    const report = JSON.parse(stdout || '{}');
    const out = [];
    for (const [file, entry] of Object.entries(report.files ?? {})) {
      for (const m of entry.mutants ?? []) {
        if (!['Survived', 'NoCoverage'].includes(m.status)) continue;
        out.push(asFinding({
          file, line: m.location?.start?.line ?? 0, rule: `mutation/${m.status === 'NoCoverage' ? 'no-coverage' : 'survived'}`,
          message: `${m.mutatorName ?? 'mutant'} survived${m.replacement ? `: the code still passes with \`${m.replacement}\`` : ''}`,
          fix: m.status === 'NoCoverage'
            ? 'no test executes this line — add one that does, or delete the line'
            : 'a test asserted the behaviour around this line but not the behaviour of it: strengthen the assertion, or suppress with a `why:` if the mutant is equivalent',
        }));
      }
    }
    return out;
  },

  // semgrep --json
  semgrep(stdout) {
    const report = JSON.parse(stdout || '{}');
    return (report.results ?? []).map((r) => asFinding({
      file: r.path, line: r.start?.line ?? 0, rule: r.check_id,
      message: r.extra?.message ?? r.check_id,
      fix: r.extra?.fix ? `suggested: ${r.extra.fix}` : 'make a judgment call on this path; suppress with a `why:` if the rule does not apply here',
    }));
  },

  // depcruise --output-type json. Dependency-cruiser reasons about modules, not lines, so a
  // violation carries a file and no line — reported as 0 rather than invented, because a rule
  // about "this module may not import that one" has no line to point at.
  depcruise(stdout) {
    const report = JSON.parse(stdout || '{}');
    return (report.summary?.violations ?? []).map((v) => asFinding({
      file: v.from, line: 0, rule: `layers/${v.rule?.name ?? 'violation'}`,
      message: `${v.from} → ${v.to}${v.rule?.comment ? `: ${v.rule.comment}` : ''}`,
      fix: 'move the dependency to a layer that may hold it, or invert it; suppress with a `why:` only if the declared layering is what is wrong',
    }));
  },

  // import-linter (Python). Text: the contract name, then the illegal chains beneath it.
  'import-linter'(stdout) {
    const out = [];
    let contract = 'layers';
    for (const raw of (stdout || '').split('\n')) {
      const broken = raw.match(/^(.+?)\s+BROKEN\s*$/);
      if (broken) { contract = broken[1].trim(); continue; }
      const chain = raw.match(/^\s*[-*]?\s*([\w.]+)\s*(?:->|→)\s*([\w.]+)\s*$/);
      if (!chain) continue;
      out.push(asFinding({
        file: `${chain[1].replaceAll('.', '/')}.py`, line: 0, rule: `layers/${contract}`,
        message: `${chain[1]} → ${chain[2]} breaks the "${contract}" contract`,
        fix: 'move the dependency to a layer that may hold it, or invert it; suppress with a `why:` only if the declared layering is what is wrong',
      }));
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

  // why: malformed JSON with exit 0 used to be accepted as a clean structured report.
  // The process exit code cannot establish what an unreadable report says.
  if (findings.length === 0 && (code !== 0 || parseError)) {
    const tail = (stderr || stdout || '').trim().split('\n').slice(-12).join('\n');
    findings = [asFinding({ rule: parseError ? 'harness/unparseable-output' : 'exit-nonzero', message: parseError ? `Cannot parse ${format} report: ${parseError}${tail ? `\n${tail}` : ''}` : tail || `exited ${code}` })];
  }
  return findings;
}

export const KNOWN_FORMATS = Object.keys(FORMATS);
