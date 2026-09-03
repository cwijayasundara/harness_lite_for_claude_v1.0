#!/usr/bin/env node
// One-shot: split the delivery contracts into the three-file chain, then delete this script.
//
// lean-v2 B5. Every contract becomes `.aidlc/artifacts/<slug>/{intent,spec,plan}.md`. Sections
// map by meaning, not by position:
//
//   intent.md   the existing .aidlc/artifacts/intent/<slug>.md, verbatim
//   spec.md     Outcome, Observable behaviours, Out of scope, Safeguards, Entities
//   plan.md     Approach, Files (from Structure and ownership), Order (Operations), Proof
//
// No approval is invented. A contract's sealed digests are copied into frontmatter as
// `migrated_from`, which records what was approved and deliberately does not read as an approval
// of the split file: those digests covered a document that no longer exists. The migrated
// artifacts are therefore drafts, and `scope-drift` will not honour them until a human approves
// them again. That is the same rule Phase 0 applied to the legacy lifecycle.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const A = path.join(root, '.aidlc', 'artifacts');
const contractsDir = path.join(A, 'contracts');
const write = process.argv.includes('--write');

const field = (body, name) => body.match(new RegExp(`^- \\*\\*${name}:\\*\\*\\s*(.+)$`, 'mi'))?.[1]?.trim() ?? null;

function section(body, name) {
  const m = body.match(new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1].trim() : null;
}

function compose(title, slug, parts) {
  const lines = [`# ${title}: ${slug}`, ''];
  for (const [heading, text] of parts) {
    if (!text) continue;
    lines.push(`## ${heading}`, '', text, '');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

const front = (extra) => `---\nstatus: draft\n${Object.entries(extra).filter(([, v]) => v && v !== 'pending').map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;

if (!existsSync(contractsDir)) { console.error('nothing to migrate: no .aidlc/artifacts/contracts'); process.exit(1); }

const planned = [];
for (const name of readdirSync(contractsDir).filter((f) => f.endsWith('.md')).sort()) {
  const slug = name.slice(0, -3);
  const body = readFileSync(path.join(contractsDir, name), 'utf8');
  const target = path.join(A, slug);
  if (existsSync(target)) { console.error(`refusing: ${path.relative(root, target)} already exists`); process.exit(1); }

  const legacyIntent = path.join(A, 'intent', `${slug}.md`);
  const intent = existsSync(legacyIntent)
    ? readFileSync(legacyIntent, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '')
    : compose('Intent', slug, [['Problem', section(body, 'Outcome')]]);

  const spec = compose('Spec', slug, [
    ['Outcome', section(body, 'Outcome')],
    ['Observable behaviours', section(body, 'Observable behaviours')],
    ['Out of scope', section(body, 'Out of scope')],
    ['Safeguards', section(body, 'Safeguards')],
    ['Entities and existing context', section(body, 'Entities and existing context')],
  ]);

  const plan = compose('Plan', slug, [
    ['Approach', section(body, 'Approach and rejected alternatives')],
    ['Files', section(body, 'Structure and ownership')],
    ['Order', section(body, 'Operations')],
    ['Proof', section(body, 'Proof')],
  ]);

  planned.push({ slug, target, files: [
    ['intent.md', front({ migrated_from: 'aidlc.contract/v1' }) + intent.trimStart()],
    ['spec.md', front({ migrated_from: field(body, 'Spec approval digest') }) + spec],
    ['plan.md', front({ migrated_from: field(body, 'Plan approval digest') }) + plan],
  ] });
}

for (const { slug, target, files } of planned) {
  if (!write) { console.log(`DRY-RUN  ${slug} -> ${path.relative(root, target)}/`); continue; }
  mkdirSync(target, { recursive: true });
  for (const [name, text] of files) writeFileSync(path.join(target, name), text.trimEnd() + '\n', { flag: 'wx' });
  console.log(`${path.relative(root, target)}/`);
}

console.log(`${planned.length} contract(s)${write ? ' migrated' : ' would migrate; pass --write'}`);
