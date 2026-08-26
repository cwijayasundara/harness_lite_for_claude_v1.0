import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const REQUIRED_SECTIONS = [
  'Outcome', 'Observable behaviours', 'Out of scope', 'Entities and existing context',
  'Approach and rejected alternatives', 'Structure and ownership', 'Safeguards', 'Operations', 'Proof',
];

function field(body, name) {
  return body.match(new RegExp(`^- \\*\\*${name}:\\*\\*\\s*(.+)$`, 'mi'))?.[1]?.trim() ?? null;
}

function withoutApprovalValues(body) {
  return body
    .replace(/^- \*\*Spec status:\*\*.*$/mi, '- **Spec status:** <approval>')
    .replace(/^- \*\*Spec approval digest:\*\*.*$/mi, '- **Spec approval digest:** <approval>')
    .replace(/^- \*\*Plan status:\*\*.*$/mi, '- **Plan status:** <approval>')
    .replace(/^- \*\*Plan approval digest:\*\*.*$/mi, '- **Plan approval digest:** <approval>')
    .replace(/\r\n/g, '\n').trimEnd() + '\n';
}

function specSurface(body) {
  const normalized = withoutApprovalValues(body);
  const operations = normalized.indexOf('\n## Operations\n');
  return operations === -1 ? normalized : normalized.slice(0, operations).trimEnd() + '\n';
}

function hash(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

const text = (value, max = 500) => typeof value === 'string' && value.length > 0 && value.length <= max;
const dateTime = (value) => text(value, 100) && Number.isFinite(Date.parse(value));
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, allowed, at, issues) => {
  if (!plain(value)) { issues.push(`${at} must be an object`); return; }
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push(`${at}: unsupported field ${key}`);
};

function writeExclusive(file, body) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, body, { flag: 'wx', mode: 0o600 });
    if (existsSync(file)) throw new Error(`refusing to overwrite ${file}`);
    renameSync(tmp, file);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}

function replaceAtomic(file, body) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, body, { flag: 'wx', mode: 0o600 });
    renameSync(tmp, file);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}

export const snapshotDigest = (value) => hash(value);

export function isCommitted(root, file) {
  try {
    const rel = path.relative(root, file);
    const committed = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return committed === readFileSync(file, 'utf8');
  } catch { return false; }
}

export function contractDigest(body, scope = 'plan') {
  if (!['spec', 'plan'].includes(scope)) throw new Error(`contract digest scope must be spec or plan, got ${scope}`);
  return hash(scope === 'spec' ? specSurface(body) : withoutApprovalValues(body));
}

export function behaviourIds(body) {
  return [...body.matchAll(/^### (B[1-9][0-9]*)\s*$/gm)].map((match) => match[1]);
}

export function ownedFiles(body) {
  const section = body.match(/^## Structure and ownership\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
  return [...section.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim()).filter(Boolean);
}

export function parseContract(body) {
  return {
    schema: field(body, 'Schema'), change_id: field(body, 'Change id'), intent_ref: field(body, 'Intent ref'),
    story_ref: field(body, 'Story ref'), risk: field(body, 'Risk'), spec_status: field(body, 'Spec status'),
    spec_approval_digest: field(body, 'Spec approval digest'), plan_status: field(body, 'Plan status'),
    plan_approval_digest: field(body, 'Plan approval digest'),
  };
}

export function validateIntentRef(value) {
  const issues = [];
  exactKeys(value, ['schema', 'id', 'source', 'decision', 'snapshot_digest'], 'intent ref', issues);
  if (value?.schema !== 'aidlc.intent-ref/v1') issues.push('intent ref: schema must be aidlc.intent-ref/v1');
  if (!text(value?.id, 128)) issues.push('intent ref: id is required and must be at most 128 characters');
  exactKeys(value?.source, ['provider', 'locator', 'revision', 'authority'], 'intent ref source', issues);
  if (!text(value?.source?.provider, 80) || !text(value?.source?.locator, 500) || !text(value?.source?.revision, 200)) issues.push('intent ref: source provider, locator, and revision are required');
  if (!['external', 'git'].includes(value?.source?.authority)) issues.push('intent ref: authority must be external or git');
  if (value?.source?.authority === 'git' && value?.source?.provider !== 'git') issues.push('intent ref: git authority requires provider git');
  exactKeys(value?.decision, ['status', 'decided_by', 'decided_at'], 'intent ref decision', issues);
  if (!['draft', 'accepted', 'closed'].includes(value?.decision?.status)) issues.push('intent ref: decision status must be draft, accepted, or closed');
  if (value?.snapshot_digest !== 'pending' && !DIGEST.test(value?.snapshot_digest ?? '')) issues.push('intent ref: snapshot_digest must be pending or sha256:<64 hex>');
  if (value?.decision?.status === 'draft' && (value?.decision?.decided_by != null || value?.decision?.decided_at != null)) issues.push('intent ref: draft decision cannot have an actor or timestamp');
  if (['accepted', 'closed'].includes(value?.decision?.status)) {
    if (!text(value?.decision?.decided_by, 200)) issues.push('intent ref: decided_by is required after a decision');
    if (!dateTime(value?.decision?.decided_at)) issues.push('intent ref: decided_at must be an ISO date-time after a decision');
    if (!DIGEST.test(value?.snapshot_digest ?? '')) issues.push('intent ref: a decided intent requires an immutable snapshot digest');
    if (value?.source?.revision === 'pending' || value?.source?.revision === 'working-tree') issues.push('intent ref: a decided intent requires a reproducible source revision');
  }
  return issues;
}

export function validateContract(root, file) {
  const body = readFileSync(file, 'utf8'); const meta = parseContract(body); const issues = []; let intent = null;
  if (meta.schema !== 'aidlc.contract/v1') issues.push('contract: schema must be aidlc.contract/v1');
  if (!meta.change_id) issues.push('contract: Change id is required');
  if (!['low', 'standard', 'critical'].includes(meta.risk)) issues.push('contract: Risk must be low, standard, or critical');
  let sectionAt = -1;
  for (const section of REQUIRED_SECTIONS) {
    const at = body.indexOf(`\n## ${section}\n`);
    if (at === -1) issues.push(`contract: missing section ${section}`);
    else if (at <= sectionAt) issues.push(`contract: section ${section} is out of order`);
    else sectionAt = at;
  }
  const behaviours = behaviourIds(body);
  if (!behaviours.length) issues.push('contract: at least one stable behaviour id (### B1) is required');
  if (new Set(behaviours).size !== behaviours.length) issues.push('contract: behaviour ids must be unique');
  if (meta.change_id !== path.basename(file, '.md')) issues.push('contract: Change id must match the contract filename');
  const refFile = meta.intent_ref ? path.resolve(path.dirname(file), meta.intent_ref) : null;
  const refsRoot = path.resolve(root, '.aidlc', 'artifacts', 'intent-refs');
  if (!refFile || !refFile.startsWith(refsRoot + path.sep) || !existsSync(refFile)) issues.push('contract: Intent ref must resolve under .aidlc/artifacts/intent-refs');
  else {
    try {
      if (!realpathSync(refFile).startsWith(realpathSync(refsRoot) + path.sep)) issues.push('contract: Intent ref cannot escape through a symlink');
      intent = JSON.parse(readFileSync(refFile, 'utf8')); issues.push(...validateIntentRef(intent));
      if (intent.id !== meta.change_id) issues.push('contract: intent id must match Change id');
    }
    catch { issues.push('intent ref: file must contain valid JSON'); }
  }
  if (!['draft', 'approved'].includes(meta.spec_status)) issues.push('contract: Spec status must be draft or approved');
  if (!['draft', 'approved'].includes(meta.plan_status)) issues.push('contract: Plan status must be draft or approved');
  const expectedSpec = contractDigest(body, 'spec'); const expectedPlan = contractDigest(body, 'plan');
  if (meta.spec_status === 'approved' && meta.spec_approval_digest !== expectedSpec) issues.push('contract: spec approval digest is missing or stale');
  if (meta.spec_status === 'approved' && intent?.decision?.status !== 'accepted') issues.push('contract: spec cannot be approved before intent acceptance');
  if (meta.plan_status === 'approved' && meta.plan_approval_digest !== expectedPlan) issues.push('contract: plan approval digest is missing or stale');
  if (meta.plan_status === 'approved' && meta.spec_status !== 'approved') issues.push('contract: plan cannot be approved before spec');
  return { ok: issues.length === 0, issues, meta, intent, digests: { spec: expectedSpec, plan: expectedPlan } };
}

export function sealContract(file, scope) {
  if (!['spec', 'plan'].includes(scope)) throw new Error('seal scope must be spec or plan');
  let body = readFileSync(file, 'utf8');
  if (scope === 'plan' && field(body, 'Spec status') !== 'approved') throw new Error('approve the spec before sealing the plan');
  const digest = contractDigest(body, scope);
  const label = scope === 'spec' ? 'Spec' : 'Plan';
  body = body.replace(new RegExp(`^- \\*\\*${label} status:\\*\\*.*$`, 'mi'), `- **${label} status:** approved`)
    .replace(new RegExp(`^- \\*\\*${label} approval digest:\\*\\*.*$`, 'mi'), `- **${label} approval digest:** ${digest}`);
  replaceAtomic(file, body); return digest;
}

export function writeIntentRef(file, { id, provider, locator, revision, authority }) {
  const value = { schema: 'aidlc.intent-ref/v1', id, source: { provider, locator, revision, authority }, decision: { status: 'draft', decided_by: null, decided_at: null }, snapshot_digest: 'pending' };
  const issues = validateIntentRef(value); if (issues.length) throw new Error(issues.join('; '));
  writeExclusive(file, JSON.stringify(value, null, 2) + '\n'); return value;
}

export function decideIntentRef(file, { status = 'accepted', by, revision, snapshot_digest, now = new Date() }) {
  if (!['accepted', 'closed'].includes(status)) throw new Error('intent decision must be accepted or closed');
  const value = JSON.parse(readFileSync(file, 'utf8'));
  const current = value.decision?.status;
  if (!((current === 'draft' && status === 'accepted') || (current === 'accepted' && status === 'closed'))) throw new Error(`intent is already ${current ?? 'decided'} and cannot transition to ${status}`);
  value.source.revision = revision;
  value.snapshot_digest = snapshot_digest;
  value.decision = { status, decided_by: by, decided_at: now.toISOString() };
  const issues = validateIntentRef(value); if (issues.length) throw new Error(issues.join('; '));
  replaceAtomic(file, JSON.stringify(value, null, 2) + '\n');
  return value;
}

export function writeEvidence(file, changeId, digest, behaviours = [], now = new Date()) {
  const traced = Object.fromEntries(behaviours.map((id) => [id, { status: 'pending', evidence: [] }]));
  const value = { schema: 'aidlc.evidence/v1', change_id: changeId, contract_digest: digest, generated_at: now.toISOString(), capabilities: {}, behaviours: traced, review: { status: 'pending' } };
  const issues = validateEvidence(value); if (issues.length) throw new Error(issues.join('; '));
  writeExclusive(file, JSON.stringify(value, null, 2) + '\n'); return value;
}

export function validateEvidence(value) {
  const issues = [];
  exactKeys(value, ['schema', 'change_id', 'contract_digest', 'generated_at', 'capabilities', 'behaviours', 'review'], 'evidence', issues);
  if (value?.schema !== 'aidlc.evidence/v1') issues.push('evidence: schema must be aidlc.evidence/v1');
  if (!text(value?.change_id, 128)) issues.push('evidence: change_id is required');
  if (!DIGEST.test(value?.contract_digest ?? '')) issues.push('evidence: contract_digest must be sha256:<64 hex>');
  if (!dateTime(value?.generated_at)) issues.push('evidence: generated_at must be an ISO date-time');
  if (!plain(value?.capabilities)) issues.push('evidence: capabilities must be an object');
  if (!plain(value?.behaviours)) issues.push('evidence: behaviours must be an object');
  if (!plain(value?.review) || !['pending', 'approved', 'changes-requested'].includes(value?.review?.status)) issues.push('evidence: review status must be pending, approved, or changes-requested');
  return issues;
}

export function validateEvidenceForContract(value, body) {
  const issues = validateEvidence(value);
  const meta = parseContract(body); const digest = contractDigest(body, 'plan'); const ids = behaviourIds(body);
  if (value?.change_id !== meta.change_id) issues.push('evidence: change_id does not match contract');
  if (value?.contract_digest !== digest) issues.push('evidence: contract digest is stale');
  for (const id of ids) {
    const item = value?.behaviours?.[id];
    if (!plain(item)) issues.push(`evidence: missing behaviour ${id}`);
    else {
      if (!['pending', 'pass', 'fail', 'blocked'].includes(item.status)) issues.push(`evidence: ${id} has invalid status`);
      if (!Array.isArray(item.evidence)) issues.push(`evidence: ${id} evidence must be an array`);
      else if (item.status === 'pass' && !item.evidence.length) issues.push(`evidence: ${id} pass requires at least one evidence reference`);
    }
  }
  for (const id of Object.keys(value?.behaviours ?? {})) if (!ids.includes(id)) issues.push(`evidence: unknown behaviour ${id}`);
  return issues;
}

export function contractState(root, file, evidenceFile = null) {
  const validation = validateContract(root, file); const meta = validation.meta;
  if (!validation.intent || validation.intent.decision?.status !== 'accepted') return { stage: 'intent-acceptance', ok: validation.ok, issues: validation.issues };
  const refFile = path.resolve(path.dirname(file), meta.intent_ref);
  if (!isCommitted(root, refFile)) return { stage: 'intent-acceptance', ok: false, issues: ['intent acceptance is not committed'] };
  if (meta.spec_status !== 'approved') return { stage: 'spec-approval', ok: validation.ok, issues: validation.issues };
  if (meta.plan_status !== 'approved') return isCommitted(root, file)
    ? { stage: 'plan-approval', ok: validation.ok, issues: validation.issues }
    : { stage: 'spec-approval', ok: false, issues: ['spec approval is not committed'] };
  if (!isCommitted(root, file)) return { stage: 'plan-approval', ok: false, issues: ['plan approval is not committed'] };
  if (!evidenceFile || !existsSync(evidenceFile)) return { stage: 'evidence', ok: validation.ok, issues: validation.issues };
  let evidence;
  try { evidence = JSON.parse(readFileSync(evidenceFile, 'utf8')); }
  catch { return { stage: 'evidence', ok: false, issues: ['evidence: file must contain valid JSON'] }; }
  const issues = validateEvidenceForContract(evidence, readFileSync(file, 'utf8'));
  if (issues.length) return { stage: 'evidence', ok: false, issues };
  const statuses = Object.values(evidence.behaviours).map((item) => item.status);
  if (statuses.some((status) => status !== 'pass')) return { stage: 'evidence', ok: true, issues: [], behaviours: evidence.behaviours };
  if (evidence.review.status !== 'approved') return { stage: 'review', ok: true, issues: [], behaviours: evidence.behaviours };
  return { stage: 'complete', ok: true, issues: [], behaviours: evidence.behaviours };
}

export function writePromptManifest(file, { changeId, contractFile, contractBody, role, provider, modelResolution }) {
  if (!['execute', 'evaluate'].includes(role)) throw new Error('prompt role must be execute or evaluate');
  if (!text(provider, 80)) throw new Error('prompt provider is required');
  if (!modelResolution || !text(modelResolution.model, 200) || !text(modelResolution.policy_digest, 80)) throw new Error('prompt model resolution is required');
  const contract_digest = contractDigest(contractBody, 'plan');
  const prompt = `Role: ${role}\nContract: ${contractFile}\nContract digest: ${contract_digest}\nValidate the digest before work. ${role === 'evaluate' ? 'Use a fresh read-only context and return findings mapped to behaviour IDs.' : 'Implement only the approved scope and emit evidence mapped to behaviour IDs.'}`;
  const value = { schema: 'aidlc.prompt-manifest/v1', change_id: changeId, contract_digest, role, provider, model_resolution: modelResolution, renderer: 'aidlc.prompt/v1', prompt_digest: snapshotDigest(prompt), prompt };
  writeExclusive(file, JSON.stringify(value, null, 2) + '\n'); return value;
}

function markdownSection(body, name) {
  return body.match(new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'))?.[1]?.trim() ?? '';
}

export function renderLegacyContract(template, { intent, spec, plan }) {
  const outcome = markdownSection(intent, 'Proposed outcome') || markdownSection(intent, 'Problem');
  const rawBehaviours = markdownSection(spec, 'Behaviour').split('\n').map((line) => line.match(/^\d+\.\s+(.+)/)?.[1]).filter(Boolean);
  const behaviours = (rawBehaviours.length ? rawBehaviours : ['Reconfirm the legacy behaviour before approval.'])
    .map((item, index) => `### B${index + 1}\n\n${item}`).join('\n\n');
  const operations = markdownSection(plan, 'Order of work') || '1. Re-plan this migrated change.';
  const files = markdownSection(plan, 'Files').match(/```[^\n]*\n([\s\S]*?)```/)?.[1]?.split('\n').map((line) => line.trim()).filter(Boolean) ?? [];
  const ownership = files.length ? files.map((file) => `- \`${file}\``).join('\n') : '<Reconfirm exact repository-relative paths.>';
  return template
    .replace('<Observable result, in the language of the affected user.>', outcome || '<Reconfirm the intended outcome.>')
    .replace(/### B1\n\nGiven \.\.\.\nWhen \.\.\.\nThen \.\.\./, behaviours)
    .replace('<Modules and exact repository-relative paths owned by this change.>', ownership)
    .replace('1. <Ordered implementation step naming an exact path.>', operations);
}
