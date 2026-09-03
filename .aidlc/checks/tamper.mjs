// The one anti-pattern every source on this names, and the one nothing else here catches.
//
// Fowler, on sensors for coding agents: "AI frequently increases thresholds rather than
// refactors", and human review "should start from the exceptions AI created — suppressed
// warnings, increased thresholds". The playbook says to block agents editing test files during a
// fix. v6 had gates for both and lean_v1 shipped neither, so an agent could turn a red bar green
// by raising the bar and nothing in the harness would have an opinion.
//
// Three rules, all read off the diff, all deterministic:
//
//   raised-threshold   a number in a lint, coverage or complexity config went up
//   bare-suppression   a new eslint-disable / noqa / type: ignore / ts-expect-error with no why
//   deleted-test       a test file removed or emptied without the plan naming it
//
// A suppression is not banned. A suppression nobody can question is: `# noqa  # why: vendored
// stub, upstream issue 412` passes, a naked `# noqa` does not. The rule is Law 10 applied to the
// agent's own escape hatches — no why, no control, and no exception either.

import { execFileSync } from 'node:child_process';
import * as artifacts from '../lib/artifacts.mjs';

// execFile with an argument array, not a shell string: no shell means no metacharacter to
// interpret, whatever ends up in a path.
const git = (root, args) => {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }); } catch { return ''; }
};

const SUPPRESSIONS = [
  [/eslint-disable(?:-next-line|-line)?\b/, 'eslint-disable'],
  [/#\s*noqa\b/, 'noqa'],
  [/#\s*type:\s*ignore\b/, 'type: ignore'],
  [/@ts-(?:ignore|expect-error)\b/, 'ts-ignore'],
  [/#\s*pragma:\s*no\s*cover\b/, 'no cover'],
  [/\bharness:allow-[a-z-]+\b/, 'harness:allow'],
];

// Files where a number going up is a threshold going up. Anything else — a version, a port, a
// test fixture — is not this rule's business, and guessing would make it noise.
const THRESHOLD_FILES = /(eslintrc|eslint\.config|\.flake8|setup\.cfg|pyproject\.toml|tox\.ini|jest\.config|vitest\.config|\.coveragerc|sonar-project|tsconfig)/i;
const THRESHOLD_KEY = /(max-|maxlines|complexity|threshold|coverage|min[-_]?(?:coverage|score)|branches|statements|functions|lines)\b/i;

export async function run(cfg) {
  const root = cfg.layout.root;
  const diff = git(root, ['diff', '--unified=0', 'HEAD', '--']);
  if (!diff.trim()) return { verdict: 'pass', findings: [] };

  const owned = new Set(artifacts.governingPlans(cfg).flatMap((p) => p.owns));
  const claimed = (file) => [...owned].some((d) => file === d || file.startsWith(d.replace(/\/$/, '') + '/'));

  const findings = [];
  let file = null;
  let line = 0;

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ b/')) { file = raw.slice(6).trim(); continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (!file) continue;

    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      const text = raw.slice(1);

      // A suppression inside a string literal is a mention, not a suppression. This rule found
      // its own test fixture on the first run — `writeFileSync(f, 'x = 1  # noqa\n')` — which is
      // the third time in this repository that a check has confused naming a thing with doing it.
      // Real suppressions are comments and never quoted; stripping quoted spans costs nothing.
      const code = text.replace(/'[^']*'/g, ' ').replace(/"[^"]*"/g, ' ').replace(/`[^`]*`/g, ' ');

      for (const [re, name] of SUPPRESSIONS) {
        if (!re.test(code)) continue;
        // A why on the same line is the whole exemption. It is what turns an override into a
        // decision someone can disagree with later.
        if (/\bwhy:/i.test(text)) continue;
        findings.push({
          file, line, rule: 'bare-suppression',
          message: `${name} added with no why:`,
          fix: `explain it on the same line — \`${name}  # why: <the reason>\` — or remove the suppression`,
        });
      }

      if (THRESHOLD_FILES.test(file) && THRESHOLD_KEY.test(text)) {
        const now = Number(/(-?\d+(?:\.\d+)?)/.exec(text)?.[1]);
        const was = Number(/(-?\d+(?:\.\d+)?)/.exec(
          diff.split('\n').find((l) => l.startsWith('-') && !l.startsWith('---') && THRESHOLD_KEY.test(l) && l.slice(1).replace(/[\d.]+/g, '') === text.replace(/[\d.]+/g, '')) ?? '',
        )?.[1]);
        if (Number.isFinite(now) && Number.isFinite(was) && now > was) {
          findings.push({
            file, line, rule: 'raised-threshold',
            message: `a limit moved from ${was} to ${now}`,
            fix: 'refactor to the limit, or raise it in its own commit with the reason — a bar moved to fit the code stops measuring the code',
          });
        }
      }
      line++;
    }
  }

  // A deleted or emptied test is the loudest of the three, and the cheapest to check.
  for (const rawLine of git(root, ['diff', '--name-status', 'HEAD', '--']).split('\n')) {
    const [status, name] = rawLine.split('\t');
    if (!name || !/(^|\/)(test|tests|spec|__tests__)\//.test(name) && !/\.(test|spec)\.[a-z]+$/.test(name)) continue;
    if (status?.startsWith('D') && !claimed(name)) {
      findings.push({
        file: name, line: 0, rule: 'deleted-test',
        message: 'a test file was deleted and no approved plan names it',
        fix: 'add the path to "## Files" in plan.md and re-approve, or restore the test',
      });
    }
  }

  return { verdict: findings.length ? 'fail' : 'pass', findings };
}
