// G13. Every approved behaviour has a proof row, and that row still names something real.
//
// This is `behavioursHaveTests`, moved out of the eval library and into the commit stage. It was
// written as a campaign assertion, so it only ever ran inside a graded eval — the one place the
// answer does not change anything. It is a property of a repository at commit time: a spec that
// has quietly become fiction is a spec nobody can rely on, and the mechanical half of that is
// checkable with no model.
//
// It replaces `test_quality`, which counted `test(` occurrences in files whose names looked like
// tests. That control could not tell a suite from a file of comments, and in ~90 recorded runs it
// never once fired. A behaviour with no proof row is a smaller claim than "the tests are good",
// and unlike the old one it is true.
//
// Only the mechanical part is graded. The plan skill permits a row to name runtime evidence
// instead of a test — "manual check is only honest when the thing genuinely cannot be automated"
// — and such a row is reported `unverifiable`, never a violation. A behaviour retired on purpose
// is retired by removing it from spec.md, so it is simply absent.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { promiseSpecs, behavioursOf, proofRowsOf, testRowIn } from '../lib/artifacts.mjs';

export function proofRows(root) {
  const violations = [];
  const unverifiable = [];
  let checked = 0;
  const artifactsRoot = path.join(root, '.claude/harness', 'artifacts');
  if (!existsSync(artifactsRoot)) return { ok: true, violations, unverifiable, checked };
  // Reads `promiseSpecs()` — approved, or `migrated_from` present — rather than `status: approved`
  // alone: a migrated spec carries no approval and is a promise the code must keep all the same.
  const cfg = { layout: { root, artifacts: artifactsRoot } };
  for (const spec of promiseSpecs(cfg)) {
    const planPath = path.join(artifactsRoot, spec.slug, 'plan.md');
    if (!existsSync(planPath)) continue;
    const behaviours = behavioursOf(spec.body);
    if (!behaviours.length) continue;
    const proof = proofRowsOf(readFileSync(planPath, 'utf8'));
    for (const b of behaviours) {
      checked++;
      const evidence = proof.get(b);
      if (evidence === undefined) { violations.push(`${spec.slug} ${b}: plan.md's Proof table names no row`); continue; }
      const row = testRowIn(evidence);
      if (!row) { unverifiable.push(`${spec.slug} ${b}`); continue; }
      const testFile = path.join(root, row.file);
      if (!existsSync(testFile)) { violations.push(`${spec.slug} ${b}: proof file "${row.file}" does not exist`); continue; }
      if (row.identifier && !readFileSync(testFile, 'utf8').includes(row.identifier)) {
        violations.push(`${spec.slug} ${b}: "${row.file}" no longer contains "${row.identifier}"`);
      }
    }
  }
  return { ok: violations.length === 0, violations, unverifiable, checked };
}

export async function run(cfg) {
  const result = proofRows(cfg.layout.root);
  const findings = result.violations.map((message) => {
    const slug = message.split(' ')[0];
    return {
      file: path.relative(cfg.layout.root, path.join(cfg.layout.artifacts, slug, 'plan.md')),
      line: 0, rule: 'proof/missing', message,
      fix: 'add or repair the row in the plan\'s ## Proof table so it names the test that proves this behaviour; a behaviour that genuinely cannot be automated names its runtime evidence instead',
    };
  });
  return {
    verdict: findings.length ? 'fail' : 'pass',
    findings,
    note: `${result.checked} behaviour(s) checked${result.unverifiable.length ? `, ${result.unverifiable.length} name evidence rather than a test` : ''}`,
  };
}
