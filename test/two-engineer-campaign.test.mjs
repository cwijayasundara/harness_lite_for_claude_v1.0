// Deterministic engineers and host observations are simulations. Product execution and Git
// worktrees/merges are real. The evaluator is outside both engineers' declared write scopes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { stage, FIXTURES } from '../evals/lib/stage.mjs';
import { loadConfig } from '../.aidlc/lib/config.mjs';
import * as a from '../.aidlc/lib/artifacts.mjs';
import { writeBlocked } from '../.aidlc/lib/guard.mjs';
import { coordination } from '../.aidlc/lib/coordination.mjs';
import { productContext } from '../.aidlc/lib/product-context.mjs';
import { exportInvocation } from '../.aidlc/lib/ledger.mjs';
import { check } from '../.aidlc/lib/runner.mjs';
import { BIN, A } from './_paths.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }).trim();
const write = (root, file, text) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
const commit = (root, message) => { git(root, 'add', '-A'); git(root, '-c', 'commit.gpgsign=false', 'commit', '-qm', message); return git(root, 'rev-parse', 'HEAD'); };
const merge = (root, ref) => { git(root, '-c', 'commit.gpgsign=false', 'merge', '--no-ff', '-qm', 'Simulated integration: ' + ref, ref); return git(root, 'rev-parse', 'HEAD'); };
const config = root => loadConfig(root);
const checks = async (root, slug, base, actor) => check(config(root), { stage: 'stop', base, candidate: git(root, 'rev-parse', 'HEAD'), change: slug, actor });
const captured = (root, report) => exportInvocation(config(root).layout, report.provenance.invocation);
const requirePass = report => assert.equal(report.ok, true, JSON.stringify({ controls: report.controls, errors: report.identity_errors }));

function draft(root, { slug, criterion, source, files, behaviour, depends, continuity, supersedes }) {
  const cfg = config(root);
  a.create(cfg, slug, path.join(A, 'templates'));
  writeFileSync(a.file(cfg, slug, 'intent'), a.render({ status: 'draft', source: 'requirements.md', source_revision: source, parent: 'partial-payments' }, `# Intent: ${slug}\n\nSupport partial invoice payments with explicit accounting semantics.\n`));
  writeFileSync(a.file(cfg, slug, 'spec'), a.render({ status: 'draft', ...(continuity ? { extends: continuity } : {}), ...(supersedes ? { supersedes } : {}) },
    `# Spec: ${slug}\n\n## Outcome\n\nInvoice balances follow the reviewed payment rule.\n\n## Requirements\n\n| Source criterion | Behaviour IDs |\n|---|---|\n| ${criterion} | B1 |\n\n## Observable behaviours\n\n### B1\n\n${behaviour}\n\n## Design\n\nA shared credit function defines payment semantics; portal and report remain separate consumers.\n\n## Out of scope\n\nChanging customer creation, invoice storage or late fees.\n\n## Safeguards\n\nPreserve integer cents and existing ledger behavior. No external dependencies.\n`));
  writeFileSync(a.file(cfg, slug, 'plan'), a.render({ status: 'draft', ...(depends ? { depends_on: depends.slug } : {}) },
    `# Plan: ${slug}\n\n## Approach\n\nImplement only this consumer or shared contract and retain regression assertions.\n\n## Files\n\n${files.map(f => '- `'+f+'`').join('\n')}\n\n## Order\n\n1. Run the relevant product test and implement the bounded behavior.\n\n## Proof\n\n| Behaviour | Test or evidence |\n|---|---|\n| B1 | \`${files.find(f => f.startsWith('tests/'))}\` |\n` +
    (depends ? `\n## Dependencies\n\n| Change | Interface | Revision |\n|---|---|---|\n| ${depends.slug} | src/payment-contract.mjs | ${depends.revision} |\n` : '')));
}
function approve(root, slug) {
  const cfg = config(root);
  a.approve(cfg, slug, 'spec', { by: 'simulated-product-owner' });
  a.approve(cfg, slug, 'plan', { by: 'simulated-tech-lead' });
  commit(root, 'Simulated spec and plan decisions: ' + slug);
}
function prepare(root, input) {
  const base = git(root, 'rev-parse', 'HEAD');
  draft(root, input); commit(root, 'Simulated contract proposal: ' + input.slug); approve(root, input.slug);
  return base;
}
function record(root, slug, report, number) {
  const dir = `.aidlc/artifacts/${slug}`;
  const revision = report.revision;
  const host = { version: 1, repository: 'simulation/ledger', pr: number, candidate: revision.candidate,
    provenance: 'simulated-transport', verified: false, assessment: 'policy-unavailable',
    host: { number, headRefOid: revision.candidate, state: 'MERGED', mergedAt: '2026-09-08T00:00:00.000Z', mergeCommit: { oid: revision.candidate } }, delivery: { merge: revision.candidate, merged_at: '2026-09-08T00:00:00.000Z' } };
  write(root, `${dir}/checks.json`, JSON.stringify(report)); write(root, `${dir}/host.json`, JSON.stringify(host));
  write(root, `${dir}/delivery.json`, JSON.stringify({ version: 1, change: slug, repository: 'simulation/ledger', pr: number,
    ...revision, merge: revision.candidate, checks: `${dir}/checks.json`, host_review: `${dir}/host.json` }));
  commit(root, 'Archive simulated host observation and real checks: ' + slug);
}
const net = 'export const creditedCents = payment => payment.amountCents - payment.feeCents;\n';
const gross = 'export const creditedCents = payment => payment.amountCents;\n';
const header = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n";
const sharedTest = expected => header + `import { creditedCents } from '../src/payment-contract.mjs';\ntest('shared credit contract', () => assert.equal(creditedCents({ amountCents: 5000, feeCents: 500 }), ${expected}));\n`;
// The parent releases both processes only once both product test executions have arrived.
const barrier = `
if (process.env.TEAM_CAMPAIGN_BARRIER) {
  const fs = await import('node:fs');
  const root = process.env.TEAM_CAMPAIGN_BARRIER;
  fs.writeFileSync(root + '/' + process.env.TEAM_ENGINEER + '.ready', String(Date.now()));
  const until = Date.now() + 15000;
  while (!fs.existsSync(root + '/release')) {
    if (Date.now() > until) throw new Error('two-engineer barrier timed out');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
}
`;
const portal = "import { creditedCents } from './payment-contract.mjs';\nexport const portalBalance = (invoice, payments) => invoice.amountCents - payments.reduce((sum, p) => sum + creditedCents(p), 0);\n";
const staleReport = 'export const reportBalance = (invoice, payments) => invoice.amountCents - payments.reduce((sum, p) => sum + p.amountCents - p.feeCents, 0);\n';
const fixedReport = "import { creditedCents } from './payment-contract.mjs';\nexport const reportBalance = (invoice, payments) => invoice.amountCents - payments.reduce((sum, p) => sum + creditedCents(p), 0);\n";
function consumerTest(name, feeCase = false) {
  return header + `import { ${name}Balance } from '../src/${name}.mjs';\n` + barrier +
    `test('${name} partial payment without fees', () => assert.equal(${name}Balance({ amountCents: 10000 }, [{ amountCents: 5000, feeCents: 0 }]), 5000));\n` +
    (feeCase ? `test('${name} applies the revised fee rule', () => assert.equal(${name}Balance({ amountCents: 10000 }, [{ amountCents: 5000, feeCents: 500 }]), 5000));\n` : '');
}
async function concurrent(root, engineers) {
  const rendezvous = path.join(root, 'rendezvous'); mkdirSync(rendezvous);
  const children = [], started = Date.now();
  let timeout, cancelled = false;
  try {
    const completions = engineers.map(({ root: cwd, slug, base, actor }, i) => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [BIN, 'check', '--stage', 'stop', '--base', base, '--candidate', git(cwd, 'rev-parse', 'HEAD'), '--change', slug, '--actor', actor, '--json'],
        { cwd, env: { ...process.env, TEAM_CAMPAIGN_BARRIER: rendezvous, TEAM_ENGINEER: String(i) }, stdio: ['ignore', 'pipe', 'pipe'] });
      children.push(child); let stdout = '', stderr = '';
      child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
      child.on('error', reject);
      child.on('close', code => { try { assert.equal(code, 0, stderr + stdout); resolve(JSON.parse(stdout)); } catch (e) { reject(e); } });
    }));
    const completed = Promise.all(completions);
    const ready = (async () => {
      while (!engineers.every((_, i) => existsSync(path.join(rendezvous, `${i}.ready`)))) {
        if (cancelled) return;
        if (Date.now() - started > 15000) throw new Error('engineers did not reach product execution together');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      const arrivals = engineers.map((_, i) => Number(readFileSync(path.join(rendezvous, `${i}.ready`), 'utf8')));
      assert(children.every(c => c.exitCode === null), 'both engineer processes are still running at the barrier');
      const released = Date.now(); writeFileSync(path.join(rendezvous, 'release'), String(released));
      return { arrivals, released, both_executing_before_release: true };
    })();
    const bound = new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('concurrent check timeout')), 30000); });
    const [reports, overlap] = await Promise.race([Promise.all([completed, ready]), bound]);
    return { reports, overlap };
  } finally { cancelled = true; clearTimeout(timeout); for (const child of children) if (child.exitCode === null) child.kill('SIGKILL'); }
}

test('two engineers evolve a shared product through isolated work, reversal, integration failure and refactor', { timeout: 90000 }, async t => {
  const started = Date.now();
  const s = stage(FIXTURES, 'campaign-ledger', { product: true });
  const root = s.work;
  const evidence = { version: 1, simulation: 'two scripted engineers on one host', approvals: 'simulated', host_reviews: 'simulated',
    model_calls: 0, human_review_minutes: null, production_lead_time: null, checks: [], failures: [], integrations: [] };
  try {
    const evaluator = path.join(s.root, 'evaluator.mjs');
    writeFileSync(evaluator, `import assert from 'node:assert/strict';\nimport { pathToFileURL } from 'node:url';\nconst root = process.argv[2];\nconst { portalBalance } = await import(pathToFileURL(root + '/src/portal.mjs'));\nconst { reportBalance } = await import(pathToFileURL(root + '/src/report.mjs'));\nconst { addCustomer, addInvoice, listInvoices } = await import(pathToFileURL(root + '/src/ledger.mjs'));\nconst id = addCustomer('Acme'); addInvoice(id, 10000, '2026-10-01');\nconst invoice = listInvoices(id)[0];\nassert.equal(invoice.amountCents, 10000);\nconst payments = [{ amountCents: 5000, feeCents: 500 }];\nassert.equal(portalBalance(invoice, payments), 5000);\nassert.equal(reportBalance(invoice, payments), 5000, 'shared fee semantics must agree across consumers');\nconsole.log('integration assertions passed');\n`);
    const evaluatorDigest = hash(readFileSync(evaluator));
    const evaluate = () => spawnSync(process.execPath, [evaluator, root], { encoding: 'utf8', timeout: 10000 });
    const initial = ['src/ledger.mjs', 'src/fees.mjs', 'tests/smoke.test.mjs'].map(file => [file, readFileSync(path.join(root, file), 'utf8')]);
    const fixtureHashes = initial.map(([file]) => [file, hash(readFileSync(path.join(FIXTURES, 'campaign-ledger', file)))]);
    git(root, 'branch', '-m', 'integration');
    write(root, '.aidlc/harness.toml', '[project]\nname = "two-engineer-ledger"\n[capabilities]\ntest = "env -u NODE_TEST_CONTEXT node --test --test-reporter=tap tests/*.test.mjs"\n[formats]\ntest = "tap"\n[stages]\nstop = ["test"]\n');
    const requirements = '# Partial payments\n\n## Acceptance criteria\n\n| Criterion ID | Criterion |\n|---|---|\n| shared | Credit payment amount minus fee. |\n| portal | Show outstanding invoice balance using the shared credit rule. |\n| report | Report outstanding invoice balance using the shared credit rule. |\n| integration | Portal and report agree for payments with nonzero fees. |\n';
    write(root, 'requirements.md', requirements); const source = commit(root, 'Simulated product initiative');
    const sharedBase = prepare(root, { slug: 'shared-credit', criterion: 'shared', source, files: ['src/payment-contract.mjs', 'tests/shared.test.mjs'], behaviour: 'Given a payment with a fee, when credited, then subtract the fee from its invoice credit.' });
    write(root, 'src/payment-contract.mjs', net); write(root, 'tests/shared.test.mjs', sharedTest(4500));
    const sharedRevision = commit(root, 'Implement shared payment API');
    const shared = await checks(root, 'shared-credit', sharedBase, 'simulated-engineer-a'); requirePass(shared); record(root, 'shared-credit', shared, 1);
    const oldSpec = a.read(config(root), 'shared-credit', 'spec').text;
    for (const [slug, criterion] of [['portal', 'portal'], ['report', 'report']]) {
      prepare(root, { slug, criterion, source, files: [`src/${slug}.mjs`, `tests/${slug}.test.mjs`],
        behaviour: 'Given an invoice with payments, when queried, then show its outstanding balance using the shared credit rule.', depends: { slug: 'shared-credit', revision: sharedRevision } });
    }
    const common = git(root, 'rev-parse', 'HEAD');
    const engineers = ['portal', 'report'].map((slug, i) => ({ slug, root: path.join(s.root, `engineer-${i}`), base: common, actor: `simulated-engineer-${i === 0 ? 'a' : 'b'}` }));
    for (const e of engineers) {
      git(root, 'worktree', 'add', '-qb', e.slug, e.root);
      assert.equal(a.currentChange(config(e.root)), null, 'new worktree inherits no execution selection');
      a.selectChange(config(e.root), e.slug);
      assert.equal(writeBlocked(`src/${e.slug}.mjs`, config(e.root)), null);
      assert.match(writeBlocked(`src/${e.slug === 'portal' ? 'report' : 'portal'}.mjs`, config(e.root)), /scope|plan|owned|portal|report/);
      assert(a.governingPlans(config(e.root)).every(p => p.owns.every(file => !file.includes('evaluator'))), 'neither plan owns the evaluator; this is not an OS sandbox');
    }
    // A newly shared unrelated draft also declares an overlap; neither grants nor steals scope.
    a.create(config(root), 'future-notifications', path.join(A, 'templates'));
    write(root, '.aidlc/artifacts/future-notifications/intent.md', '---\nstatus: draft\n---\n# Future reminder emails\n');
    write(root, '.aidlc/artifacts/future-notifications/plan.md', '---\nstatus: draft\n---\n# Future plan\n\n## Files\n\n- `src/portal.mjs`\n');
    commit(root, 'Publish unrelated backlog draft');
    for (const e of engineers) {
      merge(e.root, 'integration');
      assert.equal(a.currentChange(config(e.root)).slug, e.slug);
      assert(a.currentChange(config(e.root)).plan);
      assert(coordination(config(e.root)).overlaps.some(o => o.changes.includes('future-notifications')));
    }
    const parent = coordination(config(engineers[0].root)).parents[0];
    assert.deepEqual(parent.unmapped, ['integration']); assert.match(parent.coverage, /unverified/);
    for (const e of engineers) {
      write(e.root, `src/${e.slug}.mjs`, e.slug === 'portal' ? portal : staleReport);
      write(e.root, `tests/${e.slug}.test.mjs`, consumerTest(e.slug)); commit(e.root, 'Implement independently: ' + e.slug);
    }
    const [ea, eb] = engineers;
    write(ea.root, 'src/fees.mjs', initial.find(([p]) => p === 'src/fees.mjs')[1] + '\n// deliberate out-of-scope probe\n');
    const violation = commit(ea.root, 'Deliberate simulated clean-checkout scope violation');
    assert.equal(git(ea.root, 'status', '--porcelain'), '');
    const refused = await checks(ea.root, ea.slug, common, ea.actor);
    assert.equal(refused.ok, false); assert(refused.controls.some(c => c.findings.some(f => f.file === 'src/fees.mjs' && f.rule === 'scope-drift')));
    evidence.failures.push({ kind: 'committed-scope-violation', report: refused });
    git(ea.root, '-c', 'commit.gpgsign=false', 'revert', '--no-edit', violation);
    const parallel = await concurrent(s.root, engineers);
    evidence.concurrency = parallel.overlap;
    for (const [i, r] of parallel.reports.entries()) {
      requirePass(r); assert.equal(r.provenance.actor.label, engineers[i].actor); assert.equal(r.provenance.change, engineers[i].slug);
      evidence.checks.push(captured(engineers[i].root, r));
      assert(r.trace.behaviours.every(b => b.status === 'unverified'), 'TAP suite success must not fabricate pytest-style per-behavior execution');
    }
    assert.notEqual(parallel.reports[0].provenance.invocation, parallel.reports[1].provenance.invocation);
    assert.equal(parallel.reports[0].provenance.runtime.observed.content.digest, parallel.reports[1].provenance.runtime.observed.content.digest);
    assert.equal(parallel.reports[0].provenance.policy.digest, parallel.reports[1].provenance.policy.digest);

    // Mid-flight authorized reversal: neither consumer branch has integrated yet.
    write(root, 'requirements.md', requirements.replace('Credit payment amount minus fee.', 'Credit the full payment amount; fees do not reduce invoice credit.'));
    const correctedSource = commit(root, 'Simulated product owner reverses the fee rule');
    const reversalBase = prepare(root, { slug: 'gross-credit', criterion: 'shared', source: correctedSource, supersedes: 'shared-credit#B1',
      files: ['src/payment-contract.mjs', 'tests/shared.test.mjs'], behaviour: 'Given a payment with a fee, when credited, then apply the full payment amount to the invoice.' });
    const pending = productContext(config(root), { revision: 'HEAD' });
    assert.equal(pending.behaviours.find(b => b.id === 'shared-credit#B1').state, 'effective');
    write(root, 'src/payment-contract.mjs', gross); write(root, 'tests/shared.test.mjs', sharedTest(5000));
    const reversalRevision = commit(root, 'Implement reviewed fee-rule reversal');
    const reversal = await checks(root, 'gross-credit', reversalBase, 'simulated-engineer-a'); requirePass(reversal); record(root, 'gross-credit', reversal, 2);
    assert.equal(a.read(config(root), 'shared-credit', 'spec').text, oldSpec);
    for (const e of engineers) {
      merge(e.root, 'integration');
      const dependency = coordination(config(e.root)).dependencies.find(d => d.change === e.slug);
      assert.equal(dependency.interfaces[0].status, 'changed');
      evidence.integrations.push({ change: e.slug, dependency });
      const cfg = config(e.root), intent = a.read(cfg, e.slug, 'intent');
      writeFileSync(intent.file, a.render({ ...intent.front, source_revision: correctedSource }, intent.body));
      assert.equal(a.read(cfg, e.slug, 'spec').state, 'stale-approval'); assert.deepEqual(a.governingPlans(cfg), []);
      if (e === ea) assert(a.currentChange(config(eb.root)).plan, 'another engineer keeps authority during this impact review');
      const spec = a.read(cfg, e.slug, 'spec');
      writeFileSync(spec.file, a.render(spec.front, spec.body.replace('using the shared credit rule.', 'crediting the full payment amount without subtracting fees.')));
      const plan = a.read(cfg, e.slug, 'plan');
      writeFileSync(plan.file, a.render({ ...plan.front, depends_on: 'gross-credit' }, plan.body.replace(`| shared-credit | src/payment-contract.mjs | ${sharedRevision} |`, `| gross-credit | src/payment-contract.mjs | ${reversalRevision} |`)));
      commit(e.root, 'Simulated requirement impact review: ' + e.slug); approve(e.root, e.slug);
      assert.equal(a.currentChange(cfg).slug, e.slug); assert(a.currentChange(cfg).plan);
      const r = await checks(e.root, e.slug, reversalRevision, e.actor); requirePass(r);
    }
    const beforeA = git(root, 'rev-parse', 'HEAD'); merge(root, 'portal');
    const integratedA = await checks(root, 'portal', beforeA, ea.actor); requirePass(integratedA); record(root, 'portal', integratedA, 3);
    const beforeB = git(root, 'rev-parse', 'HEAD'); const brokenMerge = merge(root, 'report');
    const integratedB = await checks(root, 'report', beforeB, eb.actor); requirePass(integratedB);

    const failedIntegration = evaluate(); assert.notEqual(failedIntegration.status, 0); assert.match(failedIntegration.stderr, /shared fee semantics/);
    evidence.failures.push({ kind: 'semantic-integration-failure', candidate: brokenMerge, individual_suite_passed: integratedB.ok, evaluator_digest: evaluatorDigest, stderr: failedIntegration.stderr });
    merge(eb.root, 'integration');
    write(eb.root, 'tests/report.test.mjs', consumerTest('report', true)); commit(eb.root, 'Pin the integration defect in engineer B regression coverage');
    const red = await checks(eb.root, 'report', beforeB, eb.actor); assert.equal(red.ok, false); assert(red.controls.some(c => c.control === 'test' && c.verdict === 'fail'));
    write(eb.root, 'src/report.mjs', fixedReport); commit(eb.root, 'Fix implementation to meet the approved gross-credit requirement');
    requirePass(await checks(eb.root, 'report', beforeB, eb.actor)); merge(root, 'report');
    const acceptedB = await checks(root, 'report', beforeB, eb.actor); requirePass(acceptedB); record(root, 'report', acceptedB, 4);
    assert.equal(evaluate().status, 0); assert.equal(hash(readFileSync(evaluator)), evaluatorDigest);
    evidence.checks.push(captured(root, acceptedB));

    const assertions = readFileSync(path.join(root, 'tests/portal.test.mjs'), 'utf8');
    const refactorBase = prepare(root, { slug: 'portal-refactor', criterion: 'portal', source: correctedSource, continuity: 'portal',
      files: ['src/portal.mjs', 'src/balance.mjs', 'tests/portal.test.mjs'], behaviour: 'Given the same invoices and payments, when formatting is refactored, then preserve every portal balance.' });
    merge(ea.root, 'integration'); a.selectChange(config(ea.root), 'portal-refactor');
    write(ea.root, 'src/balance.mjs', portal.replaceAll('portalBalance', 'outstandingBalance'));
    write(ea.root, 'src/portal.mjs', "export { outstandingBalance as portalBalance } from './balance.mjs';\n"); commit(ea.root, 'Refactor portal balance without changing assertions');
    requirePass(await checks(ea.root, 'portal-refactor', refactorBase, ea.actor)); merge(root, 'portal');
    const refactored = await checks(root, 'portal-refactor', refactorBase, ea.actor); requirePass(refactored); record(root, 'portal-refactor', refactored, 5);
    assert.equal(readFileSync(path.join(root, 'tests/portal.test.mjs'), 'utf8'), assertions);
    assert.equal(evaluate().status, 0); assert.equal(hash(readFileSync(evaluator)), evaluatorDigest);
    const view = productContext(config(root), { revision: 'HEAD' });
    assert.equal(view.unavailable, undefined, JSON.stringify(view.findings));
    assert.equal(view.behaviours.find(b => b.id === 'shared-credit#B1').state, 'historical');
    for (const id of ['gross-credit#B1', 'portal#B1', 'report#B1', 'portal-refactor#B1']) assert.equal(view.behaviours.find(b => b.id === id).state, 'effective', JSON.stringify(view.findings));
    for (const [file, bytes] of initial) assert.equal(readFileSync(path.join(root, file), 'utf8'), bytes, 'legacy product behavior/source preserved');
    for (const [file, digest] of fixtureHashes) assert.equal(hash(readFileSync(path.join(FIXTURES, 'campaign-ledger', file))), digest, 'source fixtures unchanged');
    evidence.final = { revision: git(root, 'rev-parse', 'HEAD'), evaluator_digest: evaluatorDigest, integration: 'passed', unchanged_evaluator: true, refactor_assertions_preserved: true,
      behaviours: view.behaviours.map(b => ({ id: b.id, state: b.state, execution: b.execution })), parent_acceptance: 'not claimed', source_fixtures_unchanged: true };
    evidence.elapsed_ms = Date.now() - started;
    if (process.env.HARNESS_TEAM_CAMPAIGN_REPORT) writeFileSync(process.env.HARNESS_TEAM_CAMPAIGN_REPORT, JSON.stringify(evidence, null, 2) + '\n');
    t.diagnostic(JSON.stringify({ two_worktrees: true, concurrent_product_checks: true, initial_slices: 3, scope_violation: 'rejected', dependency_reversal: 'reviewed', integration_defect: 'caught and fixed', refactor: 'preserved', elapsed_ms: evidence.elapsed_ms }));
  } finally { s.cleanup(); }
});
