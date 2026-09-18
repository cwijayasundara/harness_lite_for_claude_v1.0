// G12. What `harness init` can see of a project's toolchain, turned into capability verbs.
//
// The registry shipped every verb empty, and an empty verb is `skipped` (Law 6) — honest, and
// completely silent. A project installed the harness, ran `doctor`, saw nine dashes, and got a
// governance kernel with no sensors attached to it. Filling them by hand is the step nobody did.
//
// What this reads is the project's own manifests, never the machine it happens to run on: a verb
// is written when the project *declares* the tool, so two installs of the same repository produce
// the same registry and a laptop that happens to have `mypy` on PATH does not silently configure
// a check CI cannot run. Anything it cannot see stays empty, and stays `skipped`.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// The three complexity rules the harness expects a project's eslint config to carry, and the
// thresholds it documents. They are not written into anyone's eslint config — that file belongs
// to the project — but `doctor` and OPERATING.md state them, so "lint is configured" means the
// same thing in two repositories.
export const ESLINT_THRESHOLDS = { complexity: 10, 'max-lines-per-function': 60, 'max-params': 4 };

const read = (root, rel) => {
  try { return readFileSync(path.join(root, rel), 'utf8'); } catch { return null; }
};
const json = (root, rel) => {
  const text = read(root, rel);
  if (text === null) return null;
  try { return JSON.parse(text); } catch { return null; }
};

// A tool is "seen" when the project declares it: a dependency, a config section, or a config file.
// Nothing here consults PATH.
function nodeStack(root, out) {
  const pkg = json(root, 'package.json');
  if (!pkg) return false;
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const has = (name) => Object.hasOwn(deps, name);
  const typescript = has('typescript') || existsSync(path.join(root, 'tsconfig.json'));
  const eslint = has('eslint') || ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', '.eslintrc.json', '.eslintrc.cjs', '.eslintrc.js']
    .some((f) => existsSync(path.join(root, f)));

  if (typescript) out.set('typecheck', 'npx tsc --noEmit --pretty false', 'tsc', 'tsconfig.json or the typescript dependency');
  if (eslint) out.set('lint', 'npx eslint . --format json', 'eslint', 'an eslint config or the eslint dependency');
  if (has('prettier')) out.set('fmt', 'npx prettier --check .', 'generic', 'the prettier dependency');
  if (has('vitest')) {
    out.set('test', 'npx vitest run --reporter=json --outputFile={report}', 'generic', 'the vitest dependency');
    out.set('test_changed', 'npx vitest run --reporter=json --outputFile={report} {files}', 'generic', 'the vitest dependency');
    out.set('coverage', 'npx vitest run --coverage --coverage.reporter=lcovonly --coverage.reportsDirectory=coverage', 'lcov', 'the vitest dependency');
  } else if (typescript) {
    // The compile-then-run shape, which is what a TypeScript project without a test runner has.
    // `test_changed` stays empty on purpose: the narrowed path is the compiled file, not the
    // source file the turn changed, and a verb that claimed to narrow while running everything
    // would put the whole suite back at the end of every turn under a name that says otherwise.
    out.set('test', 'npx tsc --outDir dist && node --test --test-reporter=tap dist/test/*.test.js', 'tap', 'tsconfig.json with no test runner declared');
    out.set('coverage', 'mkdir -p coverage && npx tsc --outDir dist && node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/lcov.info dist/test/*.test.js', 'lcov', 'node\'s built-in coverage, which needs no dependency');
    out.note('test_changed stays empty for the compile-then-run shape: the narrowed path is the compiled file, not the source one');
  } else {
    out.set('test', 'node --test --test-reporter=tap test/*.test.mjs', 'tap', 'package.json with no test runner declared');
    out.set('test_changed', 'node --test --test-reporter=tap {files}', 'tap', 'package.json with no test runner declared');
    out.set('coverage', 'mkdir -p coverage && node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/lcov.info test/*.test.mjs', 'lcov', 'node\'s built-in coverage, which needs no dependency');
  }
  out.set('deps', 'npm outdated --json || true', 'generic', 'package.json');
  return true;
}

function pythonStack(root, out) {
  const pyproject = read(root, 'pyproject.toml');
  const requirements = read(root, 'requirements.txt');
  if (pyproject === null && requirements === null) return false;
  const declared = `${pyproject ?? ''}\n${requirements ?? ''}`;
  // A `[tool.x]` section, a requirement line, or a dependency-group entry — the three ways a
  // Python project declares a tool. The boundary is hyphen-aware so `pytest` does not match
  // inside `pytest-cov`, which is a different tool answering a different verb.
  const has = (name) => new RegExp(`\\[tool\\.${name}[\\].]|(?<![\\w-])${name}(?![\\w-])`, 'i').test(declared);

  if (has('ruff')) {
    out.set('fmt', 'ruff format --check {files}', 'generic', 'the ruff configuration or requirement');
    out.set('lint', 'ruff check --output-format=json {files}', 'ruff', 'the ruff configuration or requirement');
  }
  if (has('mypy')) out.set('typecheck', 'mypy .', 'mypy', 'the mypy configuration or requirement');
  if (has('pytest')) {
    out.set('test', 'python3 -m pytest -q --json-report --json-report-file={report}', 'pytest', 'the pytest configuration or requirement');
    out.set('test_changed', 'python3 -m pytest -q {files} --json-report --json-report-file={report}', 'pytest', 'the pytest configuration or requirement');
  }
  if (has('pytest-cov') || has('coverage')) {
    out.set('coverage', 'python3 -m pytest -q --cov --cov-report=json:{report}', 'coverage.py', 'the pytest-cov or coverage requirement');
  }
  out.set('deps', 'python3 -m pip list --outdated --format=json', 'generic', 'pyproject.toml or requirements.txt');
  return true;
}

// Recognised, and deliberately left empty: the harness has no documented Go verb set yet, and a
// stack it cannot fill is reported as such rather than guessed at.
function goStack(root, out) {
  if (!existsSync(path.join(root, 'go.mod'))) return false;
  out.note('go.mod found; the harness ships no Go verb set — fill [capabilities] by hand');
  return true;
}

export function detect(root) {
  const capabilities = {};
  const formats = {};
  const evidence = {};
  const notes = [];
  const out = {
    set(verb, command, format, why) {
      capabilities[verb] = command;
      if (format && format !== 'generic') formats[verb] = format;
      evidence[verb] = why;
    },
    note: (text) => notes.push(text),
  };
  const stacks = [];
  if (nodeStack(root, out)) stacks.push('node');
  if (pythonStack(root, out)) stacks.push('python');
  if (goStack(root, out)) stacks.push('go');
  return { stacks, capabilities, formats, evidence, notes };
}

// Fill empty verbs in a registry, never overwrite a configured one. A hand-edited command is a
// decision; re-running `init` must not quietly undo it.
//
// Edits are scoped to one section at a time. A whole-file substitution looked right and was not:
// `lint = ""` appears in both `[capabilities]` and `[formats]`, so writing the parser name found
// the capability line first and replaced a command with the word "eslint".
function editSection(toml, section, edit) {
  const header = new RegExp(`^\\[${section}\\]$`, 'm');
  const match = header.exec(toml);
  if (!match) return toml;
  const from = match.index + match[0].length;
  const rest = toml.slice(from);
  const next = /^\[[^\]]+\]$/m.exec(rest);
  const to = next ? from + next.index : toml.length;
  return toml.slice(0, from) + edit(toml.slice(from, to)) + toml.slice(to);
}

export function applyDetection(toml, detected) {
  const filled = [];
  let next = editSection(toml, 'capabilities', (body) => {
    let out = body;
    for (const [verb, command] of Object.entries(detected.capabilities)) {
      const empty = new RegExp(`^(${verb}\\s*=\\s*)""(.*)$`, 'm');
      if (empty.test(out)) {
        out = out.replace(empty, `$1${JSON.stringify(command)}$2`);
        filled.push(verb);
        continue;
      }
      // Already configured: a decision, and left alone.
      if (new RegExp(`^${verb}\\s*=`, 'm').test(out)) continue;
      // Absent entirely — a registry written before this verb existed. An absent line is not the
      // same decision as an empty one: it is a table that predates the question.
      out = `${out.replace(/\n+$/, '')}\n${verb.padEnd(9)} = ${JSON.stringify(command)}\n\n`;
      filled.push(verb);
    }
    return out;
  });
  if (!filled.length) return { toml: next, filled };
  // A verb the detector knows the shape of gets its parser named, in the formats table only.
  next = editSection(next, 'formats', (body) => {
    let out = body;
    for (const [verb, format] of Object.entries(detected.formats)) {
      if (!filled.includes(verb)) continue;
      const line = new RegExp(`^(${verb}\\s*=\\s*)"[^"]*"$`, 'm');
      out = line.test(out) ? out.replace(line, `$1${JSON.stringify(format)}`)
        : `${out.replace(/\n+$/, '')}\n${verb.padEnd(9)} = ${JSON.stringify(format)}\n\n`;
    }
    return out;
  });
  return { toml: next, filled };
}

export function detectionReport({ stacks, capabilities, formats, evidence, notes }, verbs) {
  const lines = [`toolchain ${stacks.length ? stacks.join(', ') : 'none recognised'}`];
  for (const verb of verbs) {
    const command = capabilities[verb];
    // `secrets` is the one verb an empty command does not silence: the harness scans itself.
    lines.push(command
      ? `  set  ${verb.padEnd(12)} ${command}${formats[verb] ? `  [${formats[verb]}]` : ''}\n       from ${evidence[verb]}`
      : verb === 'secrets' ? `  set  ${verb.padEnd(12)} the harness's built-in scanner`
        : `  --   ${verb.padEnd(12)} not detected — stays empty and skipped`);
  }
  for (const note of notes) lines.push(`  note ${note}`);
  return lines.join('\n');
}
