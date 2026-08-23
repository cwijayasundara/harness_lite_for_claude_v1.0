// Built-in because it must work on a repo with no toolchain installed at all. If the project
// has gitleaks, set capabilities.secrets in harness.toml and this is never reached.
import { readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const PATTERNS = [
  [/\bsk-[A-Za-z0-9]{20,}\b/, 'openai-key'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}\b/, 'anthropic-key'],
  [/\bghp_[A-Za-z0-9]{30,}\b/, 'github-token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'aws-access-key'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private-key'],
  [/\b(password|passwd|secret|api_?key|token)\s*[:=]\s*["'][^"'\s]{12,}["']/i, 'hardcoded-credential'],
];
const SKIP = /(^|\/)(node_modules|\.git|\.venv|dist|build|target|__pycache__)(\/|$)/;

export async function run(cfg, files) {
  let list = files;
  if (!list.length) {
    try {
      list = execSync('git ls-files', { cwd: cfg.layout.root, encoding: 'utf8' }).split('\n').filter(Boolean);
    } catch { list = []; }
  }
  const findings = [];
  for (const rel of list) {
    if (SKIP.test(rel)) continue;
    const abs = path.resolve(cfg.layout.root, rel);
    try {
      if (statSync(abs).size > 2_000_000) continue;
      const text = readFileSync(abs, 'utf8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('harness:allow-secret')) continue;
        for (const [re, rule] of PATTERNS) {
          if (re.test(lines[i])) {
            findings.push({ file: rel, line: i + 1, rule, message: `possible ${rule} committed`, fix: 'move it to an env var; if this is a fixture, append the comment harness:allow-secret' });
            break;
          }
        }
      }
    } catch { /* unreadable or binary — not a finding */ }
  }
  return { verdict: findings.length ? 'fail' : 'pass', findings };
}
