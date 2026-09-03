// The artifact chain: `intent.md -> spec.md -> plan.md -> diff -> review.md`, one directory per
// change, three human gates.
//
// This replaces lib/contract.mjs, which held one file with nine required sections and two
// independently sealed halves. That design was defensible and it cost too much: 142 of the
// repository's first 181 commits touched only artifacts, a two-line registry change took eight
// commits and a rework, and the sealed digest of half a file had to be recomputed by stripping
// the other half out of it. The playbook asks for three short files and three gates. This is
// those three files.
//
// An approval is frontmatter a human commits, and a digest of the body at the moment they
// approved it. Editing an approved body does not silently un-approve it — it reports
// `stale-approval`, which is louder, and scope-drift then treats the plan as owning nothing.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const KINDS = ['intent', 'spec', 'plan', 'review'];
export const GATED = ['spec', 'plan'];

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

// Frontmatter is a small fixed set of scalar keys. A YAML parser would be a dependency, and the
// only shapes this has to read are the ones `approve` writes.
export function parse(text) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { front: {}, body: text.replace(/^﻿/, '') };
  const front = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (kv) front[kv[1]] = kv[2].trim();
  }
  return { front, body: text.slice(match[0].length) };
}

export function render(front, body) {
  const keys = Object.entries(front).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return `---\n${keys.map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n${body.replace(/^\n+/, '')}`;
}

// The digest covers the body only. Frontmatter carries the approval itself, so including it would
// make every approval change the thing it approves.
export const bodyDigest = (text) => hash(parse(text).body.replace(/\r\n/g, '\n').trimEnd() + '\n');

export const dir = (cfg, slug) => path.join(cfg.layout.artifacts, slug);
export const file = (cfg, slug, kind) => path.join(dir(cfg, slug), `${kind}.md`);

export function isCommitted(root, target) {
  if (!existsSync(target)) return false;
  try {
    const rel = path.relative(root, target);
    // Tracked, and with no uncommitted modification. Both halves matter: a file that was never
    // added and a file edited after being added are equally not what a reviewer approved.
    execFileSync('git', ['ls-files', '--error-unmatch', rel], { cwd: root, stdio: 'ignore' });
    return execFileSync('git', ['diff', '--name-only', 'HEAD', '--', rel], { cwd: root, encoding: 'utf8' }).trim() === '';
  } catch { return false; }
}

function replaceAtomic(target, text) {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, text, { flag: 'wx', mode: 0o600 });
    renameSync(tmp, target);
  } catch (error) { rmSync(tmp, { force: true }); throw error; }
}

export function create(cfg, slug, templates) {
  const target = dir(cfg, slug);
  if (existsSync(target)) throw new Error(`${path.relative(cfg.layout.root, target)} already exists`);
  mkdirSync(target, { recursive: true });
  const written = [];
  for (const kind of KINDS) {
    const source = path.join(templates, `${kind}.md`);
    if (!existsSync(source)) continue;
    const text = readFileSync(source, 'utf8').replaceAll('{{slug}}', slug).replaceAll('{{date}}', new Date().toISOString().slice(0, 10));
    writeFileSync(file(cfg, slug, kind), text, { flag: 'wx' });
    written.push(file(cfg, slug, kind));
  }
  return written;
}

// The one approval verb. It replaces `contract accept`, `contract seal --scope spec`,
// `contract seal --scope plan` and `contract evidence` — four commands and, because each seal
// demanded a commit before the next, four commits for one decision.
export function approve(cfg, slug, kind, { by, at = new Date().toISOString() } = {}) {
  if (!GATED.includes(kind)) throw new Error(`only ${GATED.join(' and ')} are approved; ${kind} is not a gate`);
  if (!by) throw new Error('an approval needs an approver: --by <identity>');

  const target = file(cfg, slug, kind);
  if (!existsSync(target)) throw new Error(`not found: ${path.relative(cfg.layout.root, target)}`);

  // Ordering. A plan approved before its spec is a plan approved against nothing.
  if (kind === 'plan') {
    const spec = read(cfg, slug, 'spec');
    if (spec?.front.status !== 'approved') throw new Error('approve the spec before the plan');
    if (spec.state === 'stale-approval') throw new Error('the spec changed after it was approved; re-approve it first');
  }

  // Committed first, always. An approval of a working copy is an approval of something no
  // reviewer can read and no history records.
  if (!isCommitted(cfg.layout.root, target)) throw new Error(`commit ${path.relative(cfg.layout.root, target)} before approving it`);

  const text = readFileSync(target, 'utf8');
  const { front, body } = parse(text);
  replaceAtomic(target, render({ ...front, status: 'approved', by, at, digest: bodyDigest(text) }, body));
  return { file: target, digest: bodyDigest(text) };
}

export function read(cfg, slug, kind) {
  const target = file(cfg, slug, kind);
  if (!existsSync(target)) return null;
  const text = readFileSync(target, 'utf8');
  const { front, body } = parse(text);
  const approved = front.status === 'approved';
  const stale = approved && front.digest && front.digest !== bodyDigest(text);
  return {
    slug, kind, file: target, front, body, text,
    // Three states, and the third is the one that matters. An approved artifact whose body has
    // since changed is not a draft and is not approved; saying so is the whole point.
    state: stale ? 'stale-approval' : approved ? 'approved' : 'draft',
  };
}

// Owned paths, read from the plan and from nowhere else.
//
// The contract format duplicated this: the plan listed files by hand under `## Structure and
// ownership` while a test computed the same set from the diff, and ten of the twenty-three
// contracts were re-sealed because the hand-written list had missed something the test found.
// One source now, in the artifact a human approved.
export function ownedFiles(body) {
  const section = body.match(/^## Files\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
  return [...section.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean);
}

export function behaviourIds(body) {
  return [...body.matchAll(/^### (B\d+)\b/gm)].map((m) => m[1]);
}

export function slugs(cfg) {
  const root = cfg.layout.artifacts;
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, 'intent.md')))
    .map((e) => e.name).sort();
}

// Every plan a guard or a check may honour: approved, committed, and unchanged since approval.
export function governingPlans(cfg) {
  const plans = [];
  for (const slug of slugs(cfg)) {
    const plan = read(cfg, slug, 'plan');
    if (!plan || plan.state !== 'approved') continue;
    if (!isCommitted(cfg.layout.root, plan.file)) continue;
    plans.push({ slug, file: plan.file, owns: ownedFiles(plan.body) });
  }
  return plans;
}

// What `status` prints, and what a session resumes from.
export function state(cfg, slug) {
  const artifacts = Object.fromEntries(KINDS.map((kind) => [kind, read(cfg, slug, kind)]));
  const issues = [];
  for (const kind of GATED) {
    if (artifacts[kind]?.state === 'stale-approval') issues.push(`${kind}.md changed after it was approved — re-approve it or restore the approved text`);
  }
  const plan = artifacts.plan;
  if (plan?.state === 'approved' && !ownedFiles(plan.body).length) issues.push('plan.md declares no files under "## Files"');

  // `closed` is what a delivered change looks like afterwards. Without it the twenty-three
  // changes this repository has already shipped sat on the board forever waiting for a spec
  // approval nobody was going to give, and a board that is mostly noise is a board nobody reads.
  const closed = artifacts.intent?.front.status === 'closed';

  const next = closed ? 'closed'
    : !artifacts.intent ? 'intent'
      : artifacts.spec?.state !== 'approved' ? 'spec approval'
        : artifacts.plan?.state !== 'approved' ? 'plan approval'
          : artifacts.review?.front.status === 'approved' ? 'merge'
            : 'implement';

  return { slug, next, closed, issues: closed ? [] : issues, ok: closed || issues.length === 0, artifacts };
}
