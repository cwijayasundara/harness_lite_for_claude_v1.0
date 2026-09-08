// Read-only local coordination, never a source of execution or delivery authority.
// why: decomposition-allocation needs parent gaps and integration risks without global gates.
import * as a from './artifacts.mjs';
import { git, resolveCommit } from './diff.mjs';

const exact = ref => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(ref ?? '');
const safePath = value => typeof value === 'string' && value && !value.startsWith('/')
  && !value.split('/').some(p => !p || p === '.' || p === '..') && !/[\\\x00-\x1f:]/.test(value);
function blob(root, revision, file) {
  if (!safePath(file)) throw new Error('unsafe repository path');
  const entry = git(root, ['--literal-pathspecs', 'ls-tree', revision, '--', file]);
  const match = /^100(?:644|755) blob ([a-f0-9]+)\t/.exec(entry);
  if (!match) throw new Error('regular committed file unavailable');
  return match[1];
}
function inventory(root, source, revision) {
  try {
    if (!safePath(source) || !exact(revision)) throw new Error('repository source and exact commit required; external inventories unavailable');
    if (resolveCommit(root, revision) !== revision) throw new Error('source revision is not an exact commit');
    const text = git(root, ['cat-file', 'blob', blob(root, revision, source)]);
    const rows = a.coordinationTable(text, 'Acceptance criteria', ['Criterion ID', 'Criterion']);
    if (!rows || new Set(rows.map(row => row[0])).size !== rows.length) throw new Error('Acceptance criteria inventory missing or contains duplicate IDs');
    return { status: 'available', criteria: rows.map(([id, criterion]) => ({ id, criterion })) };
  } catch (error) { return { status: 'coverage-unavailable', reason: error.message, criteria: [] }; }
}
function interfaceObservation(root, row) {
  try {
    if (resolveCommit(root, row.revision) !== row.revision) throw new Error('interface revision is not an exact commit');
    const required = blob(root, row.revision, row.file);
    let ancestor;
    try { git(root, ['merge-base', '--is-ancestor', row.revision, 'HEAD']); ancestor = true; }
    catch (error) { if (error.status !== 1) throw error; ancestor = false; }
    let current;
    try { current = blob(root, 'HEAD', row.file); }
    catch { return { ...row, ancestor, status: 'missing', assessment: 'impact assessment required' }; }
    return { ...row, ancestor, matches: current === required, status: current === required ? 'matches' : 'changed',
      assessment: ancestor && current === required ? 'required snapshot present; integration acceptance unverified' : 'impact assessment required' };
  } catch (error) { return { ...row, ancestor: null, status: 'unavailable', reason: error.message, assessment: 'impact assessment required' }; }
}
const under = (file, owned) => file === owned || file.startsWith(owned.replace(/\/$/, '') + '/');
const label = artifact => ({ state: artifact?.state ?? 'absent', binding: artifact?.binding ?? 'absent' });

export function coordination(cfg, { change = null } = {}) {
  const root = cfg.layout.root, findings = [], children = [], groups = new Map();
  const entries = a.slugs(cfg).map(slug => {
    const artifacts = {};
    for (const kind of ['intent', 'spec', 'plan']) {
      try { artifacts[kind] = a.read(cfg, slug, kind); }
      catch (error) { findings.push({ change: slug, kind: 'unreadable', message: `${kind}: ${error.message}` }); }
    }
    return { slug, ...artifacts, closed: artifacts.intent?.front.status === 'closed' };
  });
  const bySlug = new Map(entries.map(entry => [entry.slug, entry]));
  const dependencies = [], adjacency = new Map();
  for (const entry of entries) {
    const { slug, intent, spec, plan, closed } = entry;
    let metadata = intent?.front ?? {};
    try { if (intent) metadata = a.coordinationDeclarations('intent', intent.text); }
    catch (error) { findings.push({ change: slug, kind: 'metadata', message: error.message }); metadata = {}; }
    const child = { change: slug, parent: metadata.parent ?? null, source: metadata.source ?? null,
      source_revision: metadata.source_revision ?? null, closed, spec: label(spec), plan: label(plan),
      assignment: { authority: 'locally recorded, unverified tracker projection', tracker: metadata.tracker ?? null,
        assignee: metadata.assignee ?? null, iteration: metadata.iteration ?? null,
        observed_at: metadata.assignment_observed_at ?? null, freshness: metadata.assignment_observed_at ? 'recorded observation; current allocation unverified' : 'unknown' }, requirements: [] };
    if (child.parent) {
      try { child.requirements = a.requirementRows(spec?.body ?? ''); }
      catch (error) { child.coverage_error = error.message; findings.push({ change: slug, kind: 'coverage', message: error.message }); }
      const key = JSON.stringify([child.parent, child.source, child.source_revision]);
      if (!groups.has(key)) groups.set(key, { parent: child.parent, source: child.source, source_revision: child.source_revision, children: [] });
      groups.get(key).children.push(child);
    }
    children.push(child);
    try {
      const declaration = plan ? a.coordinationDeclarations('plan', plan.text) : { dependsOn: [], interfaces: [] };
      adjacency.set(slug, declaration.dependsOn);
      for (const target of declaration.dependsOn) {
        const other = bySlug.get(target);
        const edge = { change: slug, prerequisite: target, status: !other ? 'missing-target' : target === slug ? 'self-dependency' : 'declared',
          prerequisite_closed: other?.closed ?? null, prerequisite_plan: label(other?.plan), delivery: 'unverified',
          interfaces: declaration.interfaces.filter(row => row.change === target).map(row => interfaceObservation(root, row)) };
        dependencies.push(edge);
        if (edge.status !== 'declared') findings.push({ change: slug, kind: 'dependency', message: `${target}: ${edge.status}` });
      }
    } catch (error) { adjacency.set(slug, []); findings.push({ change: slug, kind: 'dependency', message: error.message }); }
  }
  // A deterministic DFS reports cycle paths without interpreting approval/closure as delivery.
  const active = [], visited = new Set(), cycles = [];
  function visit(slug) {
    const at = active.indexOf(slug);
    if (at !== -1) { cycles.push([...active.slice(at), slug]); return; }
    if (visited.has(slug) || !adjacency.has(slug)) return;
    active.push(slug);
    for (const target of adjacency.get(slug)) visit(target);
    active.pop(); visited.add(slug);
  }
  for (const slug of adjacency.keys()) visit(slug);
  const parents = [...groups.values()].map(group => {
    const source = inventory(root, group.source, group.source_revision);
    const mappings = group.children.flatMap(child => child.requirements.map(row => ({ change: child.change, criterion: row.criterion,
      behaviours: row.behaviours.map(id => `${child.change}#${id}`), spec: child.spec, closed: child.closed })));
    const known = new Set(source.criteria.map(row => row.id)), mapped = new Set(mappings.map(row => row.criterion));
    return { ...group, children: group.children.map(child => child.change), coverage: 'declared only; acceptance and delivery unverified', inventory: source, mappings,
      unmapped: source.status === 'available' ? [...known].filter(id => !mapped.has(id)) : null,
      unknown: source.status === 'available' ? [...mapped].filter(id => !known.has(id)) : null };
  });
  const overlaps = [], open = entries.filter(entry => !entry.closed && entry.plan);
  for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
    const left = open[i], right = open[j], intersections = new Set();
    for (const x of a.ownedFiles(left.plan.body)) for (const y of a.ownedFiles(right.plan.body)) {
      if (under(x, y)) intersections.add(x); else if (under(y, x)) intersections.add(y);
    }
    if (intersections.size) overlaps.push({ changes: [left.slug, right.slug], plans: [label(left.plan), label(right.plan)],
      intersections: [...intersections].sort(), remedy: 'split shared prerequisite work, serialize changes, or agree an integration owner' });
  }
  return { version: 1, visibility: { scope: 'local artifact backlog', remote_prs: 'unavailable', remote_assignments: 'unavailable' },
    children: children.filter(child => !change || child.change === change),
    parents: parents.filter(parent => !change || parent.children.includes(change)),
    dependencies: dependencies.filter(edge => !change || edge.change === change || edge.prerequisite === change),
    cycles: cycles.filter(cycle => !change || cycle.includes(change)),
    overlaps: overlaps.filter(overlap => !change || overlap.changes.includes(change)),
    findings: findings.filter(finding => !change || finding.change === change) };
}

export function coordinationLines(report) {
  const lines = ['coordination: local artifact backlog; remote PR and assignment visibility unavailable'];
  for (const child of report.children) {
    if (child.parent) lines.push(`  child ${child.change} -> ${child.parent} (${child.spec.state}, ${child.spec.binding}${child.closed ? ', closed' : ''})`);
    const assignment = child.assignment;
    if (assignment.tracker || assignment.assignee || assignment.iteration || assignment.observed_at) lines.push(`  assignment ${child.change}: tracker=${assignment.tracker ?? 'unknown'} assignee=${assignment.assignee ?? 'unknown'} iteration=${assignment.iteration ?? 'unknown'} observed=${assignment.observed_at ?? 'unknown'}; ${assignment.authority}; ${assignment.freshness}`);
  }
  for (const parent of report.parents) {
    lines.push(`  parent ${parent.parent} source=${parent.source}@${parent.source_revision}: ${parent.coverage}`);
    if (parent.inventory.status !== 'available') lines.push(`    coverage-unavailable: ${parent.inventory.reason}`);
    else {
      lines.push(`    unmapped criteria: ${parent.unmapped.join(', ') || 'none'}; unknown criteria: ${parent.unknown.join(', ') || 'none'}`);
      for (const row of parent.mappings) lines.push(`    ${row.criterion} -> ${row.behaviours.join(', ')} (${row.spec.state}, ${row.spec.binding}${row.closed ? ', closed' : ''})`);
    }
  }
  for (const edge of report.dependencies) {
    lines.push(`  dependency ${edge.change} -> ${edge.prerequisite}: ${edge.status}; delivery unverified`);
    for (const row of edge.interfaces) lines.push(`    interface ${row.file}@${row.revision}: ${row.status}; ancestor=${row.ancestor ?? 'unknown'}; ${row.assessment}${row.reason ? `; ${row.reason}` : ''}`);
  }
  for (const cycle of report.cycles) lines.push(`  cycle: ${cycle.join(' -> ')}`);
  for (const overlap of report.overlaps) lines.push(`  overlap ${overlap.changes.map((slug, i) => `${slug} (${overlap.plans[i].state}, ${overlap.plans[i].binding})`).join(' / ')}: ${overlap.intersections.join(', ')}; ${overlap.remedy}`);
  if (!report.overlaps.length) lines.push('  no local overlap in this view; remote conflicts unknown');
  for (const finding of report.findings) lines.push(`  ${finding.kind} ${finding.change}: ${finding.message}`);
  return lines;
}
