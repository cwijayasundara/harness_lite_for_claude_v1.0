// Law 5, mechanically. You cannot argue with a red test; you must delete something.
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This file lives at <harness>/checks/budget.mjs, so its grandparent IS the harness: `.claude/`
// when the harness is the project, `.claude/runtime/` when it was installed into someone else's.
// Anchoring to `cfg.layout.claude` instead — as this check did — measures the harness's own
// surfaces only in the one repository where the two happen to coincide, and reports a confident
// zero everywhere else. `test/_paths.mjs` documents the same walk-up assumption for the suite.
const HARNESS = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// What the installer wrote down about the surfaces it could not leave in the project. Generated
// by `harness init`, committed with the project — never under state/, which the installed
// .gitignore drops, or CI on a cold clone would measure a different budget than the laptop did.
export const RECORD = 'harness-install.json';

const countDirs = (d) => existsSync(d) ? readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).length : 0;
const countMd = (d) => existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.md')).length : 0;

// One definition of what counts as a skill and as an agent, used both by the installer that
// records them and by the check that reads the record back.
export const shipped = (root) => ({ skills: countDirs(path.join(root, 'skills')), agents: countMd(path.join(root, 'agents')) });

function bindingsIn(file) {
  if (!existsSync(file)) return 0;
  const h = JSON.parse(readFileSync(file, 'utf8'));
  return Object.values(h.hooks ?? h).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
}

function hookLocIn(dir) {
  if (!existsSync(dir)) return 0;
  let loc = 0;
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.mjs') || f.endsWith('.js')) loc += readFileSync(path.join(dir, f), 'utf8').split('\n').length;
  }
  return loc;
}

// A surface the check cannot account for is `null`, never 0. A confident zero is what let this
// control report `pass` in every installed repository since it was written.
function recorded(C) {
  try {
    const r = JSON.parse(readFileSync(path.join(C, RECORD), 'utf8')).shipped;
    return { skills: Number.isInteger(r?.skills) ? r.skills : null, agents: Number.isInteger(r?.agents) ? r.agents : null };
  } catch { return { skills: null, agents: null }; }
}

const add = (live, external) => external === null ? null : live + external;

export function measure(cfg) {
  const C = cfg.layout.claude;
  // One ceiling over the total: what the harness supplied plus what the project added. In the
  // self-install these are the same directory, so the Set collapses and nothing double-counts.
  const roots = [...new Set([HARNESS, C].map((d) => path.resolve(d)))];
  let bindings = 0;
  let hookLoc = 0;
  for (const r of roots) {
    bindings += bindingsIn(path.join(r, 'hooks', 'hooks.json'));
    hookLoc += hookLocIn(path.join(r, 'hooks'));
  }
  const claudeMd = existsSync(cfg.layout.claudeMd) ? readFileSync(cfg.layout.claudeMd, 'utf8').split('\n').length : 0;
  // Live plus recorded. The recorded half exists only where the harness was installed into
  // someone else's project, which is exactly where the live half cannot see it.
  const external = path.resolve(HARNESS) === path.resolve(C) ? { skills: 0, agents: 0 } : recorded(C);
  return {
    skills: add(countDirs(path.join(C, 'skills')), external.skills),
    agents: add(countMd(path.join(C, 'agents')), external.agents),
    hooks: bindings,
    hook_loc: hookLoc,
    claude_md_lines: claudeMd,
  };
}

export async function run(cfg) {
  const m = measure(cfg);
  const lim = cfg.limits;
  const findings = [];
  for (const [k, v] of Object.entries(m)) {
    const max = lim[k];
    // A surface that could not be accounted for is a failure, not a pass and not an `errored`:
    // a stage is ok when nothing is `fail` (lib/runner.mjs), so anything softer stays green and
    // reproduces the defect this check exists to catch.
    if (v === null) {
      findings.push({ file: `.claude/${RECORD}`, line: 0, rule: `budget/${k}`,
        message: `${k} could not be accounted for — the budget measured nothing and will not report a pass`,
        fix: `re-run 'harness init --into .' to regenerate .claude/${RECORD}` });
    } else if (max != null && v > max) {
      findings.push({ file: '.claude/harness.toml', line: 0, rule: `budget/${k}`,
        message: `${k} = ${v}, limit ${max}`,
        fix: 'delete one before adding another — raising the limit requires a why: line and a ledger query showing the existing ones fire' });
    }
  }
  return { verdict: findings.length ? 'fail' : 'pass', findings, measured: m };
}
