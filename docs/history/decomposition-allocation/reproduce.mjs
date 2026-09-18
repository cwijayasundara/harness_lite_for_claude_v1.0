// Mutates only a disposable copy; all approval attempts are simulations.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { stage, FIXTURES } from '../../../evals/lib/stage.mjs';
import { loadConfig } from '../../lib/config.mjs';
import * as a from '../../lib/artifacts.mjs';
import { traceFixture } from '../../../test/_trace-fixture.mjs';
const s = stage(FIXTURES, 'contract-planned');
const git = (...args) => execFileSync('git', args, { cwd: s.work, encoding: 'utf8' }).trim();
try {
  const cfg = loadConfig(s.work);
  a.create(cfg, 'independent-report', '.aidlc/templates');
  const body = '# Spec: independent-report\n\n## Outcome\n\nReport request totals independently of title casing.\n\n## Observable behaviours\n\n### B1\n\nGiven recorded requests, when totals are requested, then return their count.\n\n## Out of scope\n\nChanging text conversion.\n\n## Safeguards\n\nPreserve existing title casing.\n';
  writeFileSync(a.file(cfg, 'independent-report', 'spec'), a.render({ status: 'draft' }, body));
  traceFixture(s.work);
  git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'Simulated independent product outcome');
  let refusal = null;
  try { a.approve(cfg, 'independent-report', 'spec', { by: 'simulated-fixture-reviewer' }); } catch (error) { refusal = error.message; }
  if (!refusal?.includes('says nothing about the open change')) throw new Error(`Expected coupling defect, got ${refusal}`);
  const result = { repository_revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), fixture: 'contract-planned', simulated_approval: true, refusal, expected: 'An independent report needs no extends or supersedes link to title casing.', source_fixtures_modified: false };
  writeFileSync('.aidlc/artifacts/decomposition-allocation/reproduction.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { s.cleanup(); }
