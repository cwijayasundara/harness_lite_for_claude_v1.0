// Law 5, mechanically. You cannot argue with a red test; you must delete something.
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const countDirs = (d) => existsSync(d) ? readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).length : 0;
const countMd = (d) => existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.md')).length : 0;

export function measure(cfg) {
  const C = cfg.layout.claude;
  const hooksFile = path.join(C, 'hooks', 'hooks.json');
  let bindings = 0;
  if (existsSync(hooksFile)) {
    const h = JSON.parse(readFileSync(hooksFile, 'utf8'));
    bindings = Object.values(h.hooks ?? h).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
  }
  let hookLoc = 0;
  const hookSrc = path.join(C, 'hooks');
  if (existsSync(hookSrc)) {
    for (const f of readdirSync(hookSrc)) {
      if (f.endsWith('.mjs') || f.endsWith('.js')) hookLoc += readFileSync(path.join(hookSrc, f), 'utf8').split('\n').length;
    }
  }
  const claudeMd = existsSync(cfg.layout.claudeMd) ? readFileSync(cfg.layout.claudeMd, 'utf8').split('\n').length : 0;
  return {
    skills: countDirs(path.join(C, 'skills')),
    agents: countMd(path.join(C, 'agents')),
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
    if (max != null && v > max) {
      findings.push({ file: '.claude/harness.toml', line: 0, rule: `budget/${k}`,
        message: `${k} = ${v}, limit ${max}`,
        fix: 'delete one before adding another — raising the limit requires a why: line and a ledger query showing the existing ones fire' });
    }
  }
  return { verdict: findings.length ? 'fail' : 'pass', findings, measured: m };
}
