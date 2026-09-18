// Production admission: configuration readiness, not a claim that the product is correct.
// A configured command may still fail; candidate CI supplies that evidence. This gate prevents
// an installation full of SKIPs from being presented to a team as a production harness.

const configured = (cfg, verb) => verb === 'secrets' || Boolean(String(cfg.capabilities?.[verb] ?? '').trim());

export function assessProduction(cfg) {
  const sensors = cfg.sensors ?? {};
  const required = sensors.required_profiles ?? [];
  const profiles = required.map((profile) => {
    const verbs = sensors[profile] ?? [];
    const live = verbs.filter((verb) => configured(cfg, verb));
    return {
      profile,
      verbs,
      live,
      ok: verbs.length > 0 && live.length > 0,
      reason: verbs.length === 0 ? 'profile declares no capability verbs'
        : live.length === 0 ? `none configured: ${verbs.join(', ')}` : null,
    };
  });

  // Ambient vibe-coding assurance needs both levels. `test` protects the candidate; the narrowed
  // command gives Stop useful feedback without paying for the whole suite after every turn.
  const requiredCommands = ['test', 'test_changed'];
  const commands = requiredCommands.map((verb) => ({
    verb, ok: configured(cfg, verb),
    reason: configured(cfg, verb) ? null : `${verb} is required for full and targeted behaviour feedback`,
  }));
  const findings = [
    ...profiles.filter((p) => !p.ok).map((p) => ({ kind: 'profile', name: p.profile, reason: p.reason })),
    ...commands.filter((c) => !c.ok).map((c) => ({ kind: 'command', name: c.verb, reason: c.reason })),
  ];
  return { schema: 'harness.production-admission/v1', ok: findings.length === 0, profiles, commands, findings };
}

export function renderProduction(result) {
  const lines = [`production admission: ${result.ok ? 'PASS' : 'FAIL'}`];
  for (const p of result.profiles) lines.push(`  ${p.ok ? 'PASS' : 'FAIL'} profile ${p.profile}: ${p.live.join(', ') || p.reason}`);
  for (const c of result.commands) lines.push(`  ${c.ok ? 'PASS' : 'FAIL'} command ${c.verb}${c.reason ? `: ${c.reason}` : ''}`);
  for (const f of result.findings.filter((finding) => finding.kind === 'agent-collision')) lines.push(`  FAIL ${f.name}: ${f.reason}`);
  if (result.findings.some((f) => f.kind === 'profile' || f.kind === 'command'))
    lines.push('Configure missing capabilities in .claude/harness/harness.toml; SKIP is not production evidence.');
  if (result.findings.some((f) => f.kind === 'agent-collision'))
    lines.push('Remove or rename the conflicting plugin agent before production use.');
  return lines.join('\n');
}
