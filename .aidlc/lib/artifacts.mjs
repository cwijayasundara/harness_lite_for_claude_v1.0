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
import { fileURLToPath } from 'node:url';

export const KINDS = ['intent', 'spec', 'plan', 'review'];
export const GATED = ['spec', 'plan'];

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

// Templates live one directory up from this file, wherever the harness that resolved this module
// actually is — a checkout, or a plugin cache entry. Never a project's own `.aidlc/`, which only
// ever holds `harness.toml`, the generated shim and the install record.
const TEMPLATES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

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
export function approve(cfg, slug, kind, { by, at = new Date().toISOString(), anyway = null } = {}) {
  if (!GATED.includes(kind)) throw new Error(`only ${GATED.join(' and ')} are approved; ${kind} is not a gate`);
  // B4: a flag with no reason is refused — the reason is the point, not the flag.
  if (anyway !== null && anyway !== undefined && (typeof anyway !== 'string' || !anyway.trim())) {
    throw new Error('--anyway needs a reason: --anyway "<why this is fine here>"');
  }

  // Unattended eval runs. The identity is forced, not defaulted — an agent that can choose its
  // own approver name can write a person's, and a campaign result must never be readable as
  // evidence that someone looked. The signal comes from `process.env`, set by the runner that
  // staged the copy, and nothing else: `evidence.md` F2 records an agent that rewrote
  // `harness.toml` to disable `require_contract`, and a switch that same agent could have written
  // inside the working copy would be the same defect wearing a different hat. This check runs
  // before the "needs an approver" guard below, so the working copy never gets a vote either way.
  const suppliedBy = by;
  if (process.env.AIDLC_UNATTENDED) by = 'unattended-eval-run';
  if (!by) throw new Error('an approval needs an approver: --by <identity>');
  // review `1ace6a8` (Important 3): the substitution above is silent to the caller. A real
  // person's `--by`, leaked into an environment that also carries `AIDLC_UNATTENDED`, must not be
  // discarded with only success printed — the same defect B2 exists to prevent, the other way
  // round. `discardedBy` is null unless a supplied identity was actually thrown away.
  const discardedBy = suppliedBy && suppliedBy !== by ? suppliedBy : null;

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

  // B1 and B2: content, not just state — after every precondition above, so an existing message
  // wins when both apply. `--anyway <reason>` (B4) proceeds anyway and leaves a record.
  const issues = contentIssues(cfg, slug, kind, front, body, target);
  if (issues.length && !anyway) throw new Error(issues.join('\n'));

  replaceAtomic(target, render({ ...front, status: 'approved', by, at, digest: bodyDigest(text), ...(anyway ? { approved_anyway: anyway } : {}) }, body));
  return { file: target, digest: bodyDigest(text), discardedBy };
}

// Shared verbatim between the two places an unattended run is told it may approve its own
// gates — `harness status` and the `SessionStart` hook — so the instruction cannot drift into
// two different wordings of the same thing (review `1ace6a8`, Nit 2).
export const UNATTENDED_APPROVE_NOTICE =
  'approve your own gates: `harness approve <slug> spec` then `harness approve <slug> plan` ' +
  '(omit --by; the identity is forced to unattended-eval-run regardless)';

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

export function behavioursOf(body) {
  return [...body.matchAll(/^### (B\d+)\b/gm)].map((m) => m[1]);
}

// One row per behaviour, keyed by id, evidence text verbatim. The same parser
// `evals/lib/campaign.mjs`'s `behavioursHaveTests` used to keep a private copy of — moved here so
// `approve()` can reach it too, and so there is one parser instead of two silently drifting apart.
export function proofRowsOf(planBody) {
  const rows = new Map();
  for (const line of planBody.split('\n')) {
    const m = line.match(/^\|\s*(B\d+)\s*\|\s*(.+?)\s*\|\s*$/);
    if (m) rows.set(m[1], m[2]);
  }
  return rows;
}

// A path a Proof row's evidence names that this check can go verify: it looks like a test file
// either by basename convention (`test_*.py`, `*.test.mjs`, `*.spec.ts`, `*_test.go`,
// `*_spec.rb`, `FooTest.java`, `FooTests.cs`, `conftest.py`, ...) or by living directly under a
// directory conventionally named for tests (`tests/`, `test/`, `spec/`, `specs/`, `__tests__/`)
// regardless of its own filename. Moved here from `evals/lib/campaign.mjs`, alongside
// `behavioursOf`/`proofRowsOf` above, so B7's commit-time check and `behavioursHaveTests` share
// one recognition instead of two copies drifting apart — review `1ace6a8` Nit 2 caught exactly
// that mistake, twice, in one week.
const TEST_BASENAME = [
  /^test[_.].+\.\w+$/i, // test_foo.py, test.foo.mjs
  /\.(test|spec)\.\w+$/i, // foo.test.mjs, foo.spec.ts
  /[_-](test|spec)s?\.\w+$/i, // foo_test.py, foo-spec.rb, foo_tests.py
  /(Test|Tests)\.\w+$/, // FooTest.java, FooTests.cs — case-sensitive, that casing IS the convention
  /^conftest\.py$/i,
];
const TEST_DIR_SEGMENT = /^(tests?|specs?|__tests__)$/i;

function looksLikeTestFile(candidate) {
  const parts = candidate.split('/');
  const base = parts.pop() || '';
  if (TEST_BASENAME.some((re) => re.test(base))) return true;
  return parts.some((seg) => TEST_DIR_SEGMENT.test(seg));
}

// The plan skill's own example, and the one real place in this repository that follows it
// (evals/fixtures/contract-planned/.../plan.md), write a path and its identifier inside one
// backtick span, joined by `::`; this repository's own plans instead backtick-quote a test
// *file* and describe the test in prose after it. Neither shape says "this identifier — not the
// file, the specific string — is what must survive," so only the file's existence is checked
// when there is no explicit `::`.
export function testRowIn(evidenceText) {
  for (const span of evidenceText.matchAll(/`([^`]+)`/g)) {
    const [candidate, identifier] = span[1].split('::');
    if (looksLikeTestFile(candidate)) return { file: candidate, identifier: identifier || null };
  }
  return null;
}

// The body of one `### <heading>` section — up to the next `##` or `###` heading, or the end of
// the text. Shared by `templateMarkers` to compare a real behaviour against the scaffold's.
function headingBody(text, heading) {
  const re = new RegExp(`^### ${heading}\\b.*$([\\s\\S]*?)(?=^### |^## |(?![\\s\\S]))`, 'm');
  return (re.exec(text)?.[1] ?? '').trim();
}

// B1: a template is not an artifact. Read from `.aidlc/templates/`, never hard-coded — `harness
// new` writes those files, so this recognises its own output rather than guessing at prose, and a
// template edited later cannot drift away from the checker (review `1ace6a8`, Nit 2, caught two
// hand-copied strings doing exactly that inside one week). Two shapes: an angle-bracket
// placeholder, verbatim, and a `### B<n>` whose body is still the scaffold's bare
// `Given ... / When ... / Then ...`. Returns the markers actually found in `body`, so a caller can
// name them in a refusal.
export function templateMarkers(kind, body) {
  const templatePath = path.join(TEMPLATES_DIR, `${kind}.md`);
  if (!existsSync(templatePath)) return [];
  // The template's body only (an-edited-approval-awaits-its-gate B7): the frontmatter comment
  // that reminds about `supersedes: <slug>#B<n>` is not a placeholder a spec has to replace.
  const templateText = parse(readFileSync(templatePath, 'utf8')).body;
  const found = [];
  for (const placeholder of new Set([...templateText.matchAll(/<[^<>]+>/g)].map((m) => m[0]))) {
    if (body.includes(placeholder)) found.push(placeholder);
  }
  const bareBehaviour = headingBody(templateText, 'B1');
  if (bareBehaviour) {
    for (const id of behavioursOf(body)) {
      if (headingBody(body, id) === bareBehaviour) {
        found.push(`### ${id} is still the scaffold's bare "${bareBehaviour.replace(/\n+/g, ' / ')}"`);
      }
    }
  }
  return found;
}

// B1 and B2, together: what an approval refuses about an artifact's *content*, as opposed to its
// *state* above. Presence only for B2 — F11 and F15 record that every plan an agent has written
// unprompted proves its behaviours with prose rather than a resolvable test, and a plan may
// legitimately name a test it has not written yet (`a-spec-can-be-superseded`'s plan names
// `test/supersedes.test.mjs` before that change is built). Each message names the file, what is
// missing, and the fix (B3).
function contentIssues(cfg, slug, kind, front, body, target) {
  const rel = path.relative(cfg.layout.root, target);
  const issues = [];
  for (const marker of templateMarkers(kind, body)) {
    issues.push(marker.startsWith('###')
      ? `${rel}: ${marker} — replace it with the real behaviour before approving.`
      : `${rel} still carries the scaffold's placeholder ${marker} — replace it with real content before approving.`);
  }
  if (kind === 'plan') {
    const spec = read(cfg, slug, 'spec');
    if (spec) {
      const proof = proofRowsOf(body);
      const missing = behavioursOf(spec.body).filter((id) => !proof.has(id));
      if (missing.length) {
        issues.push(`${rel}'s Proof table names no row for ${missing.join(', ')} — add one row per behaviour to its ## Proof table before approving.`);
      }
    }
  }
  // B2: a `supersedes:` link is a claim about another artifact, checked the moment it becomes
  // true — the named slug must exist, its spec must be approved, and the named `### B<n>` must be
  // in it. `no-name-points-at-nothing` is the same argument for the same reason: a link to a
  // behaviour that does not exist is a typo pointing at nothing, and it fails rather than sitting
  // silently wrong.
  if (kind === 'spec') {
    // a-named-behaviour-is-a-link B1–B3. F31: an agent wrote "the contradiction with
    // add-balance-overdue#B12 … is being superseded" into the body and left the frontmatter
    // empty. The judgment was made and the id written; only the field was missed. A body that
    // names another approved spec's behaviour by exact id must link it — no inference from
    // prose, only the shape, and only against ids that exist.
    const linked = new Set(supersedesLinks(front));
    const named = new Set();
    for (const m of body.matchAll(/\b([a-z0-9][a-z0-9-]{0,62})#(B\d+)\b/g)) {
      const [id, namedSlug, behaviourId] = m;
      if (namedSlug === slug || linked.has(id) || named.has(id)) continue;
      const other = read(cfg, namedSlug, 'spec');
      if (!other || other.state !== 'approved' || !behavioursOf(other.body).includes(behaviourId)) continue;
      named.add(id);
    }
    for (const id of named) {
      issues.push(`${rel} names ${id} in its prose without linking it — add \`supersedes: ${id}\` to the frontmatter if this spec reverses that behaviour; if it is not a reversal, remove the id from the prose or refer to the behaviour by its title instead.`);
    }
    // a-change-declares-its-relation B1–B4. F33: four campaign runs, four contradictions found
    // and written into prose, no link — nothing ever asked. A spec approved beside other open
    // approved specs declares its relation to each: `supersedes:` a behaviour of it, or
    // `extends:` it. Presence only; whether `extends:` is true is the reviewer's question.
    const related = new Set([
      ...supersedesLinks(front).map((l) => l.split('#')[0]),
      ...extendsLinks(front),
    ]);
    for (const ext of extendsLinks(front)) {
      const other = read(cfg, ext, 'spec');
      if (!other) { issues.push(`${rel}: extends: ${ext} names a change with no spec.md — fix it before approving.`); continue; }
      if (other.state !== 'approved') issues.push(`${rel}: extends: ${ext} names a spec that is not approved (${other.state}) — approve ${ext}/spec.md first.`);
    }
    const unrelated = slugs(cfg).filter((other) =>
      other !== slug && !related.has(other)
      && read(cfg, other, 'intent')?.front.status !== 'closed'
      && read(cfg, other, 'spec')?.state === 'approved');
    if (unrelated.length) {
      issues.push(`${rel} says nothing about the open change${unrelated.length > 1 ? 's' : ''} ${unrelated.join(', ')} — for each, add \`supersedes: ${unrelated[0]}#B<n>\` if a behaviour here reverses one it claims, or \`extends: ${unrelated[0]}\` if all its promises still hold.`);
    }
    for (const link of supersedesLinks(front)) {
      const m = /^([a-z0-9](?:[a-z0-9-]{0,62}))#(B\d+)$/.exec(link);
      if (!m) { issues.push(`${rel}: supersedes: ${link} is not shaped <slug>#<behaviour-id> — fix it before approving.`); continue; }
      const [, namedSlug, behaviourId] = m;
      const named = read(cfg, namedSlug, 'spec');
      if (!named) { issues.push(`${rel}: supersedes: ${link} names ${namedSlug}, which has no spec.md — fix it before approving.`); continue; }
      if (named.state !== 'approved') { issues.push(`${rel}: supersedes: ${link} names a spec that is not approved (${named.state}) — approve ${namedSlug}/spec.md first.`); continue; }
      if (!behavioursOf(named.body).includes(behaviourId)) {
        issues.push(`${rel}: supersedes: ${link} names ${behaviourId}, which does not appear in ${namedSlug}/spec.md — fix it before approving.`);
      }
    }
  }
  return issues;
}

// `supersedes: <slug>#<behaviour-id>` — comma-separated for more than one link, on one line of
// frontmatter. Kept as a plain string in `front`, the same as every other frontmatter value; this
// is the one place it is split.
export function supersedesLinks(front) {
  return (front?.supersedes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

// `extends: <slug>, <slug>` — the change whose promises all still hold under this one.
export function extendsLinks(front) {
  return (front?.extends ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Who points at what. Computed, never written — the same pattern `stale-approval` already is: a
// superseded spec's own file never changes, so this walks every *other* spec looking for a link
// back to it, rather than storing the fact on the file being pointed at. B5: a draft supersedes
// nothing, so only an approved superseding spec counts.
export function supersededBy(cfg) {
  const map = new Map();
  for (const slug of slugs(cfg)) {
    const spec = read(cfg, slug, 'spec');
    if (!spec || spec.state !== 'approved') continue;
    for (const link of supersedesLinks(spec.front)) {
      if (!map.has(link)) map.set(link, []);
      map.get(link).push(slug);
    }
  }
  return map;
}

// B2 (the-suite-measures-this-harness): "is this a promise the code must keep" and "may a plan
// be gated against it" are different questions, and the migration made them disagree. Twenty-
// three specs carry `migrated_from` — the digest of a contract sealed under the previous model —
// and no `status: approved`, because `lean-v2` deliberately invented no approval (its own spec,
// twice: "digests carried into frontmatter as `migrated_from`, and no approval is invented").
// Reading that as evidence of a prior sealed contract is reading the record; `approve()` staying
// `status === 'approved'`-only is refusing to invent one. A promise is `state === 'approved'`
// (not the raw frontmatter — a stale-approval spec's body changed since a human looked at it, and
// the digest mismatch says so) or `migrated_from` present; a plain draft is neither.
//
// Enumerates `cfg.layout.artifacts` directly rather than through `slugs()`: `slugs()` requires an
// `intent.md` alongside, which is a real property of every change `harness new` has ever
// scaffolded but has nothing to do with whether a spec is a promise — this answers that question
// from the spec alone.
export function promiseSpecs(cfg) {
  const root = cfg.layout.artifacts;
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => read(cfg, e.name, 'spec'))
    .filter((spec) => spec && (spec.state === 'approved' || Boolean(spec.front.migrated_from)));
}

export function slugs(cfg) {
  const root = cfg.layout.artifacts;
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, 'intent.md')))
    .map((e) => e.name).sort();
}

// a-diff-belongs-to-one-change B1. Which change a diff belongs to: the open change whose spec
// was approved most recently. Approving a spec is the one act in the chain that means "this is
// the work now"; closing a change (`status: closed` in intent.md) or approving the next spec is
// how it stops. Nothing is declared and nothing goes stale on its own.
//
// Three instances of one gap chose this. A branch convention fails for campaigns that never
// branch; "most recently approved plan" lands on sprint 2 in exactly the F26 case, where sprint
// 3's plan was refused and its work went through on sprint 2's authority; a declared current
// change is one more thing to forget, and forgetting it refuses every write with no change
// named, which is F2's dead end by another road.
//
// `plan` is the current change's approved committed plan, or null when there is none — and a
// current change with no approved plan governs nothing, which is the point (B3).
export function currentChange(cfg) {
  let best = null;
  for (const slug of slugs(cfg)) {
    if (read(cfg, slug, 'intent')?.front.status === 'closed') continue;
    const spec = read(cfg, slug, 'spec');
    if (!spec || spec.state !== 'approved' || !spec.front.at) continue;
    if (!best || String(spec.front.at) > String(best.at)) best = { slug, at: String(spec.front.at) };
  }
  if (!best) return null;
  const plan = read(cfg, best.slug, 'plan');
  const governs = plan?.state === 'approved' && isCommitted(cfg.layout.root, plan.file);
  return {
    slug: best.slug,
    at: best.at,
    planState: !plan ? 'absent' : plan.state === 'approved' && !governs ? 'uncommitted' : plan.state,
    plan: governs ? { slug: best.slug, file: plan.file, owns: ownedFiles(plan.body) } : null,
  };
}

// a-draft-is-a-declaration B1, B2. F30: a sprint wrote a real spec, approved nothing, and edited
// product code under the previous sprint's still-open plan. Writing a spec *is* declaring the
// work — gate 1 is what a filled-in spec is waiting for — so while one waits, nothing governs.
// The scaffold `harness new` leaves (placeholders, the bare `### B1`) declares nothing, by the
// same `templateMarkers` the approval gate uses to tell a scaffold from a spec.
//
// an-edited-approval-awaits-its-gate: an approved spec or plan that has been edited (F32 —
// sprint 3 appended behaviours to sprint 2's approved spec, the approval went stale, the stale
// spec was no longer current, and sprint 1's plan governed the write) is the same declaration
// made the other way round, and waits at the same gate. Entries: `{ slug, kind, reason }`,
// `reason` is `draft` or `stale`.
export function draftsAwaitingGate(cfg) {
  const waiting = [];
  for (const slug of slugs(cfg)) {
    if (read(cfg, slug, 'intent')?.front.status === 'closed') continue;
    const spec = read(cfg, slug, 'spec');
    // an-unattended-turn-does-not-end-on-a-question B1, B2 (F34): a written intent with no spec
    // yet is declared work too — the sprint that wrote one and stopped to ask.
    const intent = read(cfg, slug, 'intent');
    const specWritten = spec && (spec.state !== 'draft' || !templateMarkers('spec', spec.body).length);
    if (!specWritten) {
      if (intent && !templateMarkers('intent', intent.body).length) waiting.push({ slug, kind: 'spec', reason: 'unwritten' });
      continue;
    }
    if (spec.state === 'stale-approval') { waiting.push({ slug, kind: 'spec', reason: 'stale' }); continue; }
    if (spec.state === 'draft') { waiting.push({ slug, kind: 'spec', reason: 'draft' }); continue; }
    const plan = read(cfg, slug, 'plan');
    if (plan?.state === 'stale-approval') waiting.push({ slug, kind: 'plan', reason: 'stale' });
  }
  return waiting;
}

// One wording for what a waiting entry is and how it is cleared, shared by the guard, the check
// and the two reporters.
export function awaitingGateLine(entry) {
  const gate = entry.kind === 'plan' ? 2 : 1;
  const what = entry.reason === 'stale' ? `${entry.kind} edited after approval`
    : entry.reason === 'unwritten' ? 'intent written, spec not yet'
      : 'spec written and not approved';
  return `awaiting gate ${gate}: ${entry.slug} (${what})`;
}
export function awaitingGateRemedy(entry) {
  const approve = `harness approve ${entry.slug} ${entry.kind} --by <you>`;
  if (entry.reason === 'unwritten') {
    return `the change "${entry.slug}" has a written intent and no spec yet. Write its spec, approve it (${approve}) and its plan, and commit; or close the change (status: closed in its intent.md).`;
  }
  if (entry.reason === 'stale') {
    return `${entry.slug}/${entry.kind}.md was edited after it was approved. Re-approve it (${approve}) and commit, or restore the approved text; a reversal of an approved behaviour belongs in a new change with \`supersedes:\`, not in an edit to the old one.`;
  }
  return `the change "${entry.slug}" has a written spec that awaits gate 1. Approve it (${approve}) and commit, or close the change (status: closed in its intent.md).`;
}

// Every plan a guard or a check may honour. Exactly one or none: the current change's plan,
// approved, committed, and unchanged since approval. It used to return every such plan in the
// repository, which is how a closed change's plan authorised an edit two days later (B4) and a
// refused plan's work went through on another plan's ownership (F26). And none at all while a
// written spec awaits gate 1 (a-draft-is-a-declaration).
export function governingPlans(cfg) {
  if (draftsAwaitingGate(cfg).length) return [];
  const current = currentChange(cfg);
  return current?.plan ? [current.plan] : [];
}

// B6. One wording for `harness status` and `SessionStart`, so the two cannot drift apart.
export function currentLine(cfg) {
  const current = currentChange(cfg);
  const lines = [];
  if (!current) lines.push('current: none — approve a spec (harness approve <slug> spec --by <you>) before product files change');
  else if (current.plan) lines.push(`current: ${current.slug} (plan approved) — only its ## Files may change`);
  else lines.push(`current: ${current.slug} — plan not approved (${current.planState}); product writes are refused until it is, or the change is closed`);
  for (const entry of draftsAwaitingGate(cfg)) lines.push(`${awaitingGateLine(entry)} — product writes are refused until it is`);
  return lines.join('\n');
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
