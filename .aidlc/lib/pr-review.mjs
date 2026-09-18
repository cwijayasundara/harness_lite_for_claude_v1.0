// G17. The headless half of review: structured findings, deduped against what the harness has
// already said on this pull request, rendered as one comment.
//
// The comment is the only thing this writes. It does not approve, it does not merge, and it sets
// no status check — branch protection with a code-owner review is the merge gate, and a machine
// that could satisfy that gate would not be a gate. A finding is advice with evidence attached;
// the person merging decides what it is worth.
//
// It lives beside `review.mjs` rather than inside it: that file answers "what did the host say"
// and "what did the model say", and this one answers "what should be posted, given what has
// already been posted". Three questions, and the third is the only one with state.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const SCHEMA_FILE = 'schemas/review-findings.schema.json';
const MARKER = 'harness-finding';

export function reviewSchema() {
  return readFileSync(new URL(`../${SCHEMA_FILE}`, import.meta.url), 'utf8');
}

// What makes two findings the same finding. The line is deliberately not part of it: a defect
// that moved three lines down because something above it grew is the same defect, and re-posting
// it every time the file shifts is how a bot teaches people to stop reading it.
export function fingerprint({ file, detected_pattern: pattern, title }) {
  return createHash('sha256').update(`${file ?? ''} ${pattern ?? ''} ${title ?? ''}`)
    .digest('hex').slice(0, 16);
}

// Prior comments are the state. Nothing is stored on disk: the pull request already remembers
// what was said on it, and a second store would be a second answer to "have we said this".
export function postedFingerprints(comments) {
  const seen = new Set();
  for (const body of comments ?? []) {
    for (const m of String(body ?? '').matchAll(new RegExp(`<!-- ${MARKER}: ([0-9a-f]{16}) -->`, 'g'))) seen.add(m[1]);
  }
  return seen;
}

export function dedupeFindings(findings, comments) {
  const posted = postedFingerprints(comments);
  const fresh = [];
  const repeated = [];
  const seen = new Set();
  for (const finding of findings ?? []) {
    const id = fingerprint(finding);
    // Within one run too: a reviewer that reports the same pattern in the same file twice is
    // reporting it once as far as a reader is concerned.
    if (posted.has(id) || seen.has(id)) { repeated.push({ ...finding, fingerprint: id }); continue; }
    seen.add(id);
    fresh.push({ ...finding, fingerprint: id });
  }
  return { fresh, repeated };
}

const SEVERITIES = ['blocking', 'important', 'nit'];

export function renderReviewComment({ findings = [], verdict, limitations = [], base, candidate, model, repeated = [] }) {
  const short = (sha) => String(sha ?? '').slice(0, 7);
  const lines = [`## Independent review: \`${short(base)}\` to \`${short(candidate)}\``, ''];
  lines.push(`Model: \`${model}\`. Verdict: **${verdict}**. No tests were run by this reviewer.`, '');

  if (!findings.length) {
    lines.push(repeated.length
      ? `No new findings. ${repeated.length} finding(s) from an earlier comment on this pull request still stand.`
      : 'No findings.', '');
  }
  for (const severity of SEVERITIES) {
    const group = findings.filter((f) => f.severity === severity)
      .sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0));
    if (!group.length) continue;
    lines.push(`### ${severity[0].toUpperCase()}${severity.slice(1)}`, '');
    for (const f of group) {
      lines.push(`<!-- ${MARKER}: ${f.fingerprint} -->`);
      lines.push(`**${f.title}** in \`${f.file}${f.line ? `:${f.line}` : ''}\` (pattern: \`${f.detected_pattern}\`)`, '');
      if (f.detail) lines.push(f.detail, '');
      if (f.fix) lines.push(`_Fix:_ ${f.fix}`, '');
    }
  }
  if (repeated.length && findings.length) {
    lines.push(`<sub>${repeated.length} finding(s) already posted on this pull request are not repeated here.</sub>`, '');
  }
  if (limitations.length) {
    lines.push('<details><summary>What this review could not establish</summary>', '');
    for (const l of limitations) lines.push(`- ${l}`);
    lines.push('', '</details>', '');
  }
  lines.push('<sub>Posted by `harness review --comment`. It reviews; it does not approve and it cannot');
  lines.push('merge. Branch protection and a code-owner review are the merge gate.</sub>');
  return lines.join('\n');
}

// Validated to the extent that matters: the fields the renderer reads must be present and of the
// right kind, because a finding the renderer cannot place is a finding that silently disappears.
// The rest of the schema is the CLI's job, which is why the schema is handed to it.
export function parseFindings(text) {
  let parsed;
  try { parsed = typeof text === 'string' ? JSON.parse(text) : text; }
  catch { throw new Error('review did not return JSON matching the findings schema'); }
  if (!parsed || !['approve', 'changes-requested'].includes(parsed.verdict) || !Array.isArray(parsed.findings)) {
    throw new Error('review JSON has no verdict or no findings array');
  }
  for (const f of parsed.findings) {
    if (!f || typeof f.file !== 'string' || typeof f.title !== 'string' || typeof f.detected_pattern !== 'string'
      || !SEVERITIES.includes(f.severity)) {
      throw new Error(`a finding is missing a field the comment renderer needs: ${JSON.stringify(f).slice(0, 200)}`);
    }
  }
  return { verdict: parsed.verdict, findings: parsed.findings, limitations: parsed.limitations ?? [] };
}

// The `gh` calls, injectable so the dedupe and the rendering above are testable without a
// network, a token or a pull request. Read-only by construction except `postComment`, which
// posts a comment and nothing else: no review, no approval, no status check.
export function ghComments({ repo, pr, run }) {
  const out = run('gh', ['pr', 'view', String(pr), '--repo', repo, '--json', 'comments'],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  if (out.error || out.status !== 0) throw new Error('could not read the pull request comments; check gh authentication and repository access');
  try { return (JSON.parse(out.stdout).comments ?? []).map((c) => c.body ?? ''); }
  catch { throw new Error('gh returned malformed JSON for the pull request comments'); }
}

export function postComment({ repo, pr, body, run }) {
  const out = run('gh', ['pr', 'comment', String(pr), '--repo', repo, '--body-file', '-'],
    { input: body, encoding: 'utf8', timeout: 30000 });
  if (out.error || out.status !== 0) throw new Error(`could not post the review comment: ${out.stderr?.trim() || out.status}`);
  return String(out.stdout ?? '').trim();
}

// One comment per run, and silence when there is nothing new to say. A bot that comments on every
// push with the same content is a bot people mute, and a muted reviewer reviews nothing.
export function shouldComment({ fresh, repeated, comments }) {
  if (fresh.length) return true;
  // Nothing found and nothing said yet: one record that the review ran and was clean.
  return repeated.length === 0 && postedFingerprints(comments).size === 0
    && !comments.some((c) => String(c).includes('Posted by `harness review --comment`'));
}
