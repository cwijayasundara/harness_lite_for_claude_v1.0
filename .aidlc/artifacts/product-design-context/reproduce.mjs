// Only disposable product copies change. All decisions and integration are simulations.
import assert from 'node:assert/strict';
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
  const product = `${s.work}/src/app/text.py`;
  writeFileSync(product, 'def titlecase(value: str) -> str:\n    return " ".join("-".join(part[:1].upper() + part[1:] for part in word.split("-")) for word in value.split(" "))\n');
  git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'Simulated delivered hyphen rule');
  const delivered = git('rev-parse', 'HEAD');
  const originalSpec = readFileSync(a.file(cfg, 'hyphen-titlecase', 'spec'), 'utf8');
  git('checkout', '-qb', 'proposed-reversal');
  a.create(cfg, 'preserve-hyphen-case', '.aidlc/templates');
  writeFileSync(a.file(cfg, 'preserve-hyphen-case', 'spec'), a.render({ status: 'draft', supersedes: 'hyphen-titlecase#B1' },
    '# Spec: preserve-hyphen-case\n\n## Outcome\n\nPreserve casing after hyphens in names.\n\n## Observable behaviours\n\n### B1\n\nGiven mary-jane watson, when titlecase runs, then return Mary-jane Watson.\n\n## Out of scope\n\nChanging space-separated names.\n\n## Safeguards\n\nKeep titlecase pure and preserve its public interface.\n'));
  traceFixture(s.work);
  git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'Simulated proposed reversal');
  a.approve(cfg, 'preserve-hyphen-case', 'spec', { by: 'simulated-fixture-reviewer' });
  git('add', '-A'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'Simulated spec approval only');
  const replacements = Object.fromEntries(a.supersededBy(cfg));
  assert.deepEqual(replacements['hyphen-titlecase#B1'], ['preserve-hyphen-case']);
  const observed = execFileSync('python3', ['-c', 'import runpy; print(runpy.run_path("src/app/text.py")["titlecase"]("mary-jane watson"))'], { cwd: s.work, encoding: 'utf8' }).trim();
  assert.equal(observed, 'Mary-Jane Watson');
  assert.equal(readFileSync(a.file(cfg, 'hyphen-titlecase', 'spec'), 'utf8'), originalSpec);
  const result = {
    repository_revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    fixture: 'contract-planned', simulated_approval_and_integration: true,
    delivered_revision: delivered, proposal_revision: git('rev-parse', 'HEAD'),
    product_diff: git('diff', delivered, 'HEAD', '--', 'src', 'tests'),
    reported_supersession: replacements, observed_product_result: observed,
    expected: 'A proposed unmerged reversal must not retire the delivered hyphen rule in a product view.',
    source_fixtures_modified: false, historical_spec_unchanged: true,
  };
  writeFileSync('.aidlc/artifacts/product-design-context/reproduction.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { s.cleanup(); }
