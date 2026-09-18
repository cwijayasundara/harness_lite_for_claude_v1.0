// Production admission: configuration readiness, not a claim that the product is correct.
// A configured command may still fail; candidate CI supplies that evidence. This gate prevents
// an installation full of SKIPs from being presented to a team as a production harness.

const configured = (cfg, verb) => verb === 'secrets' || Boolean(String(cfg.capabilities?.[verb] ?? '').trim());

const plain = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 500;

function applyWaivers(cfg, findings, knownTargets, now) {
  const active = [], invalid = [], blocking = [...findings];
  for (const [target, waiver] of Object.entries(cfg.waivers ?? {})) {
    let reason = null;
    if (!knownTargets.has(target)) reason = 'unknown waiver target';
    else if (!waiver || typeof waiver !== 'object' || Array.isArray(waiver)) reason = 'waiver must be a table';
    else if (!plain(waiver.reason)) reason = 'reason is required';
    else if (!plain(waiver.owner)) reason = 'owner is required';
    else if (!plain(waiver.expires) || !Number.isFinite(Date.parse(waiver.expires))) reason = 'expiry must be an ISO timestamp';
    else if (Date.parse(waiver.expires) <= now) reason = `expired at ${waiver.expires}`;
    const index = blocking.findIndex((finding) => finding.name === target);
    if (!reason && index < 0) reason = 'waiver is unused because the target is healthy';
    if (reason) {
      invalid.push({ target, status: 'invalid', reason });
      blocking.push({ kind: 'waiver', name: `waiver:${target}`, reason });
      continue;
    }
    const [finding] = blocking.splice(index, 1);
    active.push({ target, status: 'active', owner: waiver.owner.trim(), reason: waiver.reason.trim(),
      expires: new Date(Date.parse(waiver.expires)).toISOString(), finding });
  }
  return { findings: blocking, waivers: [...active, ...invalid] };
}

const verbEvidence = (cfg, verb, outcomes) => {
  if (!configured(cfg, verb)) return { status: 'missing', reason: 'no command configured' };
  const row = outcomes.get(verb);
  if (!row) return { status: 'skipped', reason: 'no recorded execution for the current policy and revision' };
  const status = row.verdict === 'pass' ? 'passed' : row.verdict === 'fail' ? 'failed' : row.verdict;
  return { status, ...(row.error ? { reason: row.error } : {}),
    ...(row.note ? { reason: row.note } : {}), at: row.ts ?? null, stage: row.stage ?? null };
};

function profileEvidence(cfg, profile, verbs, outcomes) {
  const live = verbs.filter((verb) => configured(cfg, verb));
  if (!verbs.length || !live.length) return { status: 'missing', reason: 'no configured capability for this profile' };
  const observed = live.map((verb) => ({ verb, ...verbEvidence(cfg, verb, outcomes) }));
  const status = observed.some((row) => row.status === 'passed') ? 'passed'
    : observed.some((row) => row.status === 'failed') ? 'failed'
      : observed.some((row) => row.status === 'errored') ? 'errored' : 'skipped';
  return { status, controls: observed };
}

export function assessProduction(cfg, { now = Date.now(), evidence = [] } = {}) {
  const sensors = cfg.sensors ?? {};
  const outcomes = new Map();
  for (const row of evidence) if (row?.control && ['pass', 'fail', 'skipped', 'errored'].includes(row.verdict)) outcomes.set(row.control, row);
  // A project may add profiles, but it cannot make production admission easier by deleting the
  // names from required_profiles. Architecture is conditional because some products have no
  // meaningful architecture command; declaring architecture verbs makes the profile applicable.
  const mandatory = ['behaviour', 'hardening', 'qa'];
  if ((sensors.architecture ?? []).length > 0) mandatory.push('architecture');
  const required = [...new Set([...mandatory, ...(sensors.required_profiles ?? [])])];
  const profiles = required.map((profile) => {
    const verbs = sensors[profile] ?? [];
    const live = verbs.filter((verb) => configured(cfg, verb));
    return {
      profile,
      verbs,
      live,
      ok: verbs.length > 0 && live.length > 0,
      evidence: profileEvidence(cfg, profile, verbs, outcomes),
      reason: verbs.length === 0 ? 'profile declares no capability verbs'
        : live.length === 0 ? `none configured: ${verbs.join(', ')}` : null,
    };
  });

  // Ambient vibe-coding assurance needs both levels. `test` protects the candidate; the narrowed
  // command gives Stop useful feedback without paying for the whole suite after every turn.
  const requiredCommands = ['test', 'test_changed'];
  const commands = requiredCommands.map((verb) => ({
    verb, ok: configured(cfg, verb),
    evidence: verbEvidence(cfg, verb, outcomes),
    reason: configured(cfg, verb) ? null : `${verb} is required for full and targeted behaviour feedback`,
  }));
  const rawFindings = [
    ...profiles.filter((p) => !p.ok).map((p) => ({ kind: 'profile', name: p.profile, reason: p.reason })),
    ...commands.filter((c) => !c.ok).map((c) => ({ kind: 'command', name: c.verb, reason: c.reason })),
  ];
  const applied = applyWaivers(cfg, rawFindings, new Set([...required, ...requiredCommands]), now);
  const waived = new Set(applied.waivers.filter((waiver) => waiver.status === 'active').map((waiver) => waiver.target));
  for (const profile of profiles) if (waived.has(profile.profile) && profile.evidence.status !== 'passed') profile.evidence.status = 'waived';
  for (const command of commands) if (waived.has(command.verb) && command.evidence.status !== 'passed') command.evidence.status = 'waived';
  const evidenceRows = [...profiles.map((p) => p.evidence), ...commands.map((c) => c.evidence)];
  return { schema: 'harness.production-admission/v1', ok: applied.findings.length === 0,
    evidence_ok: evidenceRows.every((row) => row.status === 'passed' || row.status === 'waived'),
    profiles, commands, waivers: applied.waivers, findings: applied.findings };
}

export function renderProduction(result) {
  const lines = [`production admission: ${result.ok ? 'PASS' : 'FAIL'}`];
  const waived = new Set((result.waivers ?? []).filter((w) => w.status === 'active').map((w) => w.target));
  for (const p of result.profiles) lines.push(`  ${p.ok ? 'PASS' : waived.has(p.profile) ? 'WAIVED' : 'FAIL'} profile ${p.profile}: ${p.live.join(', ') || p.reason} (evidence: ${p.evidence.status})`);
  for (const c of result.commands) lines.push(`  ${c.ok ? 'PASS' : waived.has(c.verb) ? 'WAIVED' : 'FAIL'} command ${c.verb}${c.reason ? `: ${c.reason}` : ''} (evidence: ${c.evidence.status})`);
  for (const w of result.waivers ?? []) lines.push(`  ${w.status === 'active' ? 'WAIVED' : 'FAIL'} waiver ${w.target}: ${w.status === 'active' ? `${w.owner}, expires ${w.expires} — ${w.reason}` : w.reason}`);
  for (const f of result.findings.filter((finding) => finding.kind === 'agent-collision')) lines.push(`  FAIL ${f.name}: ${f.reason}`);
  if (result.findings.some((f) => f.kind === 'profile' || f.kind === 'command'))
    lines.push('Configure missing capabilities in .claude/harness/harness.toml; SKIP is not production evidence.');
  if (result.findings.some((f) => f.kind === 'agent-collision'))
    lines.push('Remove or rename the conflicting plugin agent before production use.');
  return lines.join('\n');
}
