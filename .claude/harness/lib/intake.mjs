// G08. Story intake: a PRD or a tracker story becomes one change, or a decomposed set of them.
//
// The kernel reads a path or takes a URL string. It does not speak to a tracker. An MCP-backed
// tracker read is performed by the agent, which writes what it read to a file and passes the
// path — so there is no tracker client, no credential, and no network call in here, and the
// document a change was decomposed from is a committed artifact a reviewer can read.
//
// What this replaces is the part of intake that was done by hand and done differently each time:
// a PRD with five stories became one change with five behaviours, or five changes with no
// recorded relationship, depending on who read it. The decomposition is now a function of the
// document, and `harness status` shows it.

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import * as artifacts from './artifacts.mjs';

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// The same shape `selectChange` and `coordinationDeclarations` already enforce, so a slug this
// produces is one every other part of the harness will accept.
export const slugify = (text) => String(text ?? '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 63)
  .replace(/-+$/, '');

const isUrl = (value) => /^https:\/\//.test(String(value ?? ''));

// `## Story: <title>`, `## Story 2 — <title>`, `### Story <title>`. The heading level is not the
// signal; the word is. A document that calls them something else is decomposed by its
// acceptance-criteria table instead (below), and a document with neither is one change.
const STORY_HEADING = /^(#{2,3})\s*Story\b[\s:—–-]*(?:(\d+)[\s:.—–-]+)?(.*)$/i;

// A story may name the stories it comes after. One line, in the story's own text, so the order
// lives in the document a human wrote rather than in a flag somebody has to remember.
const DEPENDS_LINE = /^\s*(?:[-*]\s*)?(?:\*\*)?depends on(?:\*\*)?\s*[:—–-]\s*(.+?)\s*$/im;

function documentTitle(text) {
  const heading = /^#\s+(.+)$/m.exec(text);
  return heading ? heading[1].trim() : null;
}

// Sections keyed by the story's title, in document order, each with its own body. Splitting on
// the matched heading rather than on a fixed level, so a PRD that uses `###` for stories under a
// `##` epic decomposes the same way one that uses `##` does.
function storySections(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = STORY_HEADING.exec(line);
    if (m) {
      const title = (m[3] || '').trim() || (m[2] ? `story ${m[2]}` : 'story');
      current = { title, number: m[2] ? Number(m[2]) : null, body: [] };
      sections.push(current);
      continue;
    }
    // A heading at or above the story level ends the story. Deeper headings belong to it.
    if (current && /^#{1,2}\s/.test(line) && !STORY_HEADING.test(line)) current = null;
    if (current) current.body.push(line);
  }
  return sections.map((s) => ({ ...s, body: s.body.join('\n').trim() }));
}

// The fallback decomposition: an `## Acceptance criteria` table whose Criterion IDs are grouped
// by a `<group>:<rest>` prefix. `portal:balance` and `portal:refresh` are one change; `report:*`
// is another. A table with no prefixes declares no grouping and yields nothing to split.
function criteriaGroups(text) {
  let rows;
  try { rows = artifacts.coordinationTable(text, 'Acceptance criteria', ['Criterion ID', 'Criterion']); }
  catch { return []; }
  if (!rows) return [];
  // A group is declared by a `<group>:<rest>` prefix. A table whose IDs carry no prefix declares
  // no grouping, and splitting it one-change-per-row would be inventing a decomposition the
  // document did not ask for.
  if (!rows.some(([id]) => id.includes(':'))) return [];
  const groups = new Map();
  for (const [id, criterion] of rows) {
    const key = id.includes(':') ? id.slice(0, id.indexOf(':')) : id;
    if (!groups.has(key)) groups.set(key, { title: key, number: null, criteria: [] });
    groups.get(key).criteria.push({ id, criterion });
  }
  if (groups.size < 2) return [];
  return [...groups.values()].map((g) => ({
    ...g,
    body: g.criteria.map((c) => `- \`${c.id}\` — ${c.criterion}`).join('\n'),
  }));
}

// What the document says this change comes after, resolved against its siblings' titles and
// slugs. A name that matches nothing is reported rather than dropped: a stated order the tool
// silently ignored is worse than no order at all.
function resolveDependencies(section, siblings, findings) {
  const line = DEPENDS_LINE.exec(section.body ?? '');
  if (!line) return [];
  const out = [];
  for (const raw of line[1].split(/\s*,\s*|\s+and\s+/i)) {
    const name = raw.trim().replace(/^["'`]|["'`.]$/g, '');
    if (!name || /^(nothing|none|n\/a)$/i.test(name)) continue;
    const wanted = slugify(name);
    const hit = siblings.find((s) => s.slug === wanted || slugify(s.title) === wanted
      || (s.number !== null && slugify(`story ${s.number}`) === wanted));
    if (hit && hit.slug !== section.slug) out.push(hit.slug);
    else if (!hit) findings.push(`"${section.title}" says it depends on "${name}", which names no other story in this document`);
  }
  return [...new Set(out)];
}

// Where the requirements came from, in the form `approve` will bind. A pair or nothing: G07 made
// provenance optional and a half-declaration is still refused, so an origin this cannot resolve
// is recorded in the intent's prose instead of written into frontmatter that would not verify.
export function sourceOf(root, from, revision) {
  if (isUrl(from)) {
    const url = new URL(from);
    if (url.username || url.password) throw new Error('source URL cannot contain credentials');
    return revision
      ? { front: { source: from, source_revision: revision }, note: null }
      : { front: {}, note: `${from} is recorded in the intent body only. Pass --revision <id> to bind the approval to an exact revision of it.` };
  }
  const abs = path.resolve(root, from);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`${from} is outside the repository; copy the document in, or pass an https:// URL`);
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error(`no such document: ${from}`);
  if (!artifacts.isCommitted(root, abs)) {
    return { front: {}, note: `${rel} is not committed, so the intent records it in prose only. Commit it and add source/source_revision to bind the approval to it.` };
  }
  return { front: { source: rel, source_revision: git(root, ['rev-parse', 'HEAD']) }, note: null };
}

const intentBody = ({ title, origin, body, parent }) => `# Intent: ${title}

- **Date:** ${new Date().toISOString().slice(0, 10)}
- **Source:** ${origin}${parent ? `\n- **Initiative:** ${parent}` : ''}

## Problem

${body || '<What is wrong today, in the language of whoever feels it. No solution here.>'}

## Proposed outcome

<What is true when this is done. Observable from outside the system.>

## Affected users and systems

## Constraints

## Open questions

<Only consequential unresolved questions. Write None when no questions block progress.>
`;

// Read a document and decide what it becomes. Pure: it reports the changes it would write and
// the problems it found, and `write()` below is the only thing that touches the tree. Keeping
// those apart is what lets `--split` be checked against a fixture without creating anything.
export function plan(cfg, { from, slug = null, split = false, revision = null, text = null }) {
  const root = cfg.layout.root;
  // Validated before read, so a missing or out-of-tree document is refused in this module's own
  // words rather than by a raw ENOENT from deeper down.
  const source = sourceOf(root, from, revision);
  const document = text ?? (isUrl(from) ? '' : readFileSync(path.resolve(root, from), 'utf8'));
  const findings = [];

  const title = documentTitle(document) ?? (isUrl(from) ? new URL(from).pathname.split('/').filter(Boolean).pop() : path.basename(from, path.extname(from)));
  const initiative = slugify(slug ?? title);
  if (!initiative) throw new Error(`cannot derive a slug from ${from} — pass one: harness new <slug> --from ${from}`);

  if (!split) {
    return { split: false, source, origin: from, note: source.note, findings,
      changes: [{ slug: initiative, title: title ?? initiative, parent: null, dependsOn: [], body: document.trim() }] };
  }

  const sections = storySections(document);
  const groups = sections.length ? sections : criteriaGroups(document);
  if (!groups.length) {
    throw new Error(`${from} declares no "## Story" sections and no grouped "## Acceptance criteria" table, so there is nothing to split. Run without --split.`);
  }

  const seen = new Map();
  const withSlugs = groups.map((g) => {
    let base = slugify(g.title) || (g.number !== null ? `story-${g.number}` : 'story');
    // Two stories with the same title is a document defect, not a crash. Each still gets a
    // distinct change and the collision is reported.
    if (seen.has(base)) {
      findings.push(`two stories slugify to "${base}"; the second is "${base}-2"`);
      base = `${base}-${seen.get(base) + 1}`;
    }
    seen.set(base, (seen.get(base) ?? 0) + 1);
    return { ...g, slug: base };
  });

  const changes = withSlugs.map((g) => ({
    slug: g.slug, title: g.title, parent: initiative,
    dependsOn: resolveDependencies(g, withSlugs, findings),
    body: g.body,
  }));

  return { split: true, source, origin: from, note: source.note, findings, parent: initiative, changes };
}

// Write what `plan()` decided. One directory per change, scaffolded from the templates so a
// change created this way is identical to one created by hand, plus the frontmatter the document
// justified: `parent` and the source pair on the intent, `depends_on` on the plan.
export function write(cfg, decision, templates) {
  const written = [];
  for (const change of decision.changes) {
    artifacts.create(cfg, change.slug, templates);

    const origin = decision.source.front.source
      ? `${decision.source.front.source} @ ${decision.source.front.source_revision}`
      : (decision.origin ?? 'see --from document');
    writeFileSync(artifacts.file(cfg, change.slug, 'intent'), artifacts.render(
      { status: 'draft', ...decision.source.front, ...(change.parent ? { parent: change.parent } : {}) },
      intentBody({ title: change.title, origin, body: change.body, parent: change.parent }),
    ));

    if (change.dependsOn.length) {
      const planFile = artifacts.file(cfg, change.slug, 'plan');
      const { front, body } = artifacts.parse(readFileSync(planFile, 'utf8'));
      writeFileSync(planFile, artifacts.render({ ...front, depends_on: change.dependsOn.join(', ') }, body));
    }
    written.push(change.slug);
  }
  return written;
}
