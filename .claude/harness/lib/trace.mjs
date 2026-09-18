// Derived evidence only: source -> behaviour -> declared proof -> this invocation's result.
// why: requirement-traceability product trial passes scope with no test execution.
import * as a from './artifacts.mjs';
import { git } from './diff.mjs';

export function traceEvidence(cfg, results, { validCandidate = false } = {}) {
  const selection = a.selectionState(cfg);
  const trace = { version: 1, context: validCandidate ? 'candidate' : 'local/unverified',
    change: selection.slug, authority: 'local-audit-labels', delivery: 'not-observed', behaviours: [] };
  if (!selection.ok) return { ...trace, unavailable: selection.reason };
  try {
    const spec = a.read(cfg, selection.slug, 'spec'), plan = a.read(cfg, selection.slug, 'plan');
    if (!spec || !plan) return { ...trace, unavailable: 'spec or plan missing' };
    const approval = artifact => ({ state: artifact.state, binding: artifact.binding,
      digest: artifact.front.approval_digest ?? artifact.front.digest ?? null,
      by: artifact.front.by ?? null, at: artifact.front.at ?? null });
    trace.approvals = { spec: approval(spec), plan: approval(plan) };
    trace.source = { reference: spec.front.source ?? null, revision: spec.front.source_revision ?? null,
      kind: spec.binding === 'v2' ? spec.front.source_kind : 'legacy/unbound', digest: spec.front.source_digest ?? null };
    trace.intent = { revision: spec.front.intent_revision ?? null, digest: spec.front.intent_digest ?? null };
    let requirements = [];
    try { requirements = a.requirementRows(spec.body); } catch { /* legacy rows stay unbound */ }
    const proof = a.proofRowsOf(plan.body);
    const result = results.find(r => r.control === 'test');
    trace.execution = result ? { verdict: result.verdict, command: result.command ?? '',
      observations: result.execution ?? { status: 'not-executed', tests: [] } } : { verdict: 'not-executed', command: '' };
    for (const id of a.behavioursOf(spec.body)) {
      const row = proof.get(id) ?? null;
      const declarations = plan.body.split('\n').filter(line => new RegExp(`^\\|\\s*${id}\\s*\\|`).test(line)).length;
      // Multiple explicit spans are ambiguous; the old presence sensor's first-match rule
      // cannot establish execution of an entire row.
      const spans = row ? [...row.matchAll(/`([^`]+)`/g)].map(m => m[1]) : [];
      const nodeid = declarations === 1 && spans.length === 1 && spans[0].includes('::') ? spans[0] : null;
      const matches = nodeid ? (result?.execution?.tests ?? []).filter(t => t.nodeid === nodeid) : [];
      let status = !nodeid ? 'unverified' : !result || result.verdict === 'skipped' ? 'not-executed'
        : result.execution?.status !== 'observed' ? 'unverified'
          : matches.length === 0 ? 'not-executed' : matches.length > 1 ? 'ambiguous' : matches[0].outcome;
      if (status === 'passed') {
        const testFile = nodeid.split('::')[0];
        const committed = validCandidate && /^100(644|755) blob /.test(git(cfg.layout.root, ['--literal-pathspecs', 'ls-tree', cfg.diff.candidate, '--', testFile]));
        if (!committed || result.verdict !== 'pass' || result.execution.exitcode !== 0
          || spec.state !== 'approved' || plan.state !== 'approved') status = 'unverified';
      }
      trace.behaviours.push({ id: `${selection.slug}#${id}`,
        criteria: requirements.filter(r => r.behaviours.includes(id)).map(r => r.criterion),
        proof: row, nodeid, status });
    }
    return trace;
  } catch (error) { return { ...trace, unavailable: error.message }; }
}
