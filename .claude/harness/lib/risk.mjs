// why: every change bought the same frontier review at high effort whatever it touched, and the
// first live run spent 66% of its cost there. The paths a person must read decide the tier — the
// review triage Duckbill, Anthropic and OpenAI describe — and nothing else does.
export const DEFAULT_HIGH_RISK = ['**/migrations/**', '**/*.sql', '**/auth/**', '**/security/**',
  '.github/workflows/**', '**/schema.*'];

export function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function riskTier(cfg, files) {
  const compiled = (cfg?.review?.high_risk ?? DEFAULT_HIGH_RISK).map((p) => [p, globToRegExp(p)]);
  const matched = [];
  for (const file of new Set(files)) {
    const hit = compiled.find(([, re]) => re.test(file));
    if (hit) matched.push({ file, pattern: hit[0] });
  }
  return { tier: matched.length ? 'high' : 'low', matched };
}
