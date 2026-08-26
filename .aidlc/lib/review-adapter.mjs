import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { isCommitted, validateContract, validateEvidenceForContract } from './contract.mjs';

const SEVERITIES = new Set(['blocking', 'important', 'nit']);
const safePath = (value) => typeof value === 'string' && value.length <= 300 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..');

function git(root, args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (error) { throw new Error((error.stderr || error.message).toString().trim()); }
}

export function selectSlug(root, base, head = 'HEAD') {
  const files = git(root, ['diff', '--name-only', `${base}...${head}`]).split('\n').filter(Boolean);
  const slugs = files.map((f) => f.match(/^\.aidlc\/artifacts\/contracts\/([a-z0-9][a-z0-9-]{0,62})\.md$/)?.[1]).filter(Boolean);
  const unique = [...new Set(slugs)];
  if (unique.length !== 1) throw new Error(`review requires exactly one changed contract artifact; found ${unique.length}`);
  return unique[0];
}

export function packet(cfg, slug, base, head = 'HEAD') {
  const contract = path.join(cfg.layout.contracts, `${slug}.md`); const evidenceFile = path.join(cfg.layout.evidence, `${slug}.json`);
  if (!existsSync(contract) || !existsSync(evidenceFile)) throw new Error(`review requires a contract and evidence for "${slug}"`);
  const contractText = readFileSync(contract, 'utf8');
  const reviewPolicy = cfg.layout.reviewPolicy ?? path.join(cfg.layout.root, '.aidlc', 'policies', 'review.md');
  const policy = existsSync(reviewPolicy) ? readFileSync(reviewPolicy, 'utf8') : '';
  const validation = validateContract(cfg.layout.root, contract);
  if (!validation.ok || validation.meta.plan_status !== 'approved' || !isCommitted(cfg.layout.root, contract)) throw new Error('review requires a valid, committed, fully approved delivery contract');
  const evidence = JSON.parse(readFileSync(evidenceFile, 'utf8'));
  const evidenceIssues = validateEvidenceForContract(evidence, contractText);
  if (evidenceIssues.length) throw new Error(`review evidence is invalid: ${evidenceIssues.join('; ')}`);
  const diff = git(cfg.layout.root, ['diff', '--no-ext-diff', '--unified=40', `${base}...${head}`, '--', '.', ':(exclude).aidlc/artifacts/review/**']);
  const max = cfg.budget.review_diff_max_bytes ?? 200000;
  const clipped = Buffer.byteLength(diff) > max;
  const body = clipped ? Buffer.from(diff).subarray(0, max).toString('utf8') : diff;
  return [`# Review packet: ${slug}`, '', `Base: ${base}`, `Head: ${head}`, `Diff truncated: ${clipped}`, policy ? `\n## Review policy\n\n${policy}\n` : '', '## Approved delivery contract', '', contractText, '', '## Behaviour evidence', '', '```json', JSON.stringify(evidence, null, 2), '```', '', '## Diff', '', '```diff', body, '```', clipped ? '\nERROR: diff exceeded review_diff_max_bytes; treat the review as incomplete.' : ''].join('\n');
}

export function validateReview(value) {
  if (!value || typeof value !== 'object' || !['approve', 'changes-requested'].includes(value.recommendation)) throw new Error('review recommendation must be approve or changes-requested');
  if (!Array.isArray(value.findings) || value.findings.length > 50) throw new Error('review findings must be an array of at most 50');
  const seen = new Set();
  const findings = value.findings.map((f, i) => {
    if (!SEVERITIES.has(f.severity)) throw new Error(`finding ${i}: invalid severity`);
    if (!safePath(f.file)) throw new Error(`finding ${i}: unsafe file path`);
    if (!Number.isInteger(f.line) || f.line < 1) throw new Error(`finding ${i}: line must be a positive integer`);
    if (typeof f.message !== 'string' || !f.message.trim() || f.message.length > 1000) throw new Error(`finding ${i}: invalid message`);
    if (typeof f.remedy !== 'string' || !f.remedy.trim() || f.remedy.length > 1000) throw new Error(`finding ${i}: invalid remedy`);
    const item = { severity: f.severity, file: f.file, line: f.line, message: f.message.trim(), remedy: f.remedy.trim() };
    const key = JSON.stringify(item); if (seen.has(key)) return null; seen.add(key); return item;
  }).filter(Boolean);
  if (findings.filter((f) => f.severity === 'nit').length > 5) throw new Error('review may contain at most five nits');
  if (value.recommendation === 'approve' && findings.some((f) => f.severity !== 'nit')) throw new Error('approve cannot contain blocking or important findings');
  return { recommendation: value.recommendation, summary: String(value.summary ?? '').slice(0, 2000), findings };
}

export function writeReview(cfg, slug, raw, meta = {}) {
  const value = validateReview(raw); mkdirSync(cfg.layout.review, { recursive: true });
  const rows = value.findings.length ? value.findings.map((f) => `| ${f.severity} | ${f.file}:${f.line} | ${f.message.replaceAll('|', '\\|')} | ${f.remedy.replaceAll('|', '\\|')} | open |`).join('\n') : '| — | — | No findings | — | closed |';
  const text = `# Review: ${slug}\n\n- **Date:** ${new Date().toISOString().slice(0, 10)}\n- **Contract:** [.aidlc/artifacts/contracts/${slug}.md](../contracts/${slug}.md)\n- **Status:** draft <!-- only a human changes this to approved -->\n- **Agent recommendation:** ${value.recommendation}\n- **Reviewer:** ${meta.reviewer ?? 'claude-code-action'}\n- **Commit:** ${meta.commit ?? ''}\n- **Pull request:** ${meta.pull_request ?? ''}\n\n## Verification\n\nRun \`harness check --stage commit\` before human approval.\n\n## Summary\n\n${value.summary || 'No summary supplied.'}\n\n## Findings\n\n| Severity | File/line | Finding | Required remedy | Status |\n|---|---|---|---|---|\n${rows}\n\n## Decision\n\nAgent recommendation only. A human reviewer owns Gate 3 and must commit the approval.\n`;
  const dst = path.join(cfg.layout.review, `${slug}.md`); writeFileSync(dst, text); return { file: dst, ...value };
}

export function checkProtection(value, requiredCheck = 'harness') {
  const reviews = value?.required_pull_request_reviews; const checks = value?.required_status_checks;
  const contexts = [...(checks?.contexts ?? []), ...(checks?.checks ?? []).map((c) => c.context)];
  const failures = [];
  if (!checks?.strict) failures.push('required status checks must require an up-to-date branch');
  if (!contexts.some((c) => c === requiredCheck || c.startsWith(`${requiredCheck} /`))) failures.push(`required status checks must include ${requiredCheck}`);
  if (!reviews || reviews.required_approving_review_count < 1) failures.push('at least one approving review is required');
  if (!reviews?.dismiss_stale_reviews) failures.push('stale approvals must be dismissed');
  if (!reviews?.require_last_push_approval) failures.push('the last push must be approved by someone else');
  if (!value?.enforce_admins?.enabled) failures.push('branch protection must include administrators');
  return { ok: failures.length === 0, failures };
}
