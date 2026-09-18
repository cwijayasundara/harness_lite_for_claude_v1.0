// Native Claude Code only. Never load application .env files into agent authentication.
import { spawnSync } from 'node:child_process';

const API_ENV = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'ANTHROPIC_PROFILE', 'ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID',
];

export function requireSubscription({ env = process.env, cwd, product = false, run = spawnSync } = {}) {
  const conflicts = API_ENV.filter(key => env[key]);
  if (conflicts.length) throw new Error(`API billing is disabled. Unset conflicting variables: ${conflicts.join(', ')}. Use your Claude Code subscription login or CLAUDE_CODE_OAUTH_TOKEN.`);
  if (env.CLAUDE_CODE_OAUTH_TOKEN) return 'subscription-token';
  // `product` once meant "inside a container that cannot see the host keychain", and refused
  // without a setup token. MEASURED 2026-09-15: the-harness-needs-no-container removed the
  // container and left the refusal, so the first live product trial on a logged-in laptop stopped
  // at "Container runs require CLAUDE_CODE_OAUTH_TOKEN" before spending anything. A product trial
  // now authenticates the way every other live call does; the token path stays for CI.
  void product;
  const status = run('claude', ['auth', 'status'], { env, cwd, encoding: 'utf8', timeout: 15000 });
  if (status.error?.code === 'ENOENT') throw status.error;
  let auth;
  try { auth = JSON.parse(status.stdout); } catch { /* Fail closed without logging raw credentials. */ }
  if (status.status !== 0 || auth?.loggedIn !== true || auth?.apiProvider !== 'firstParty'
      || !['claude.ai', 'oauth_token'].includes(auth?.authMethod)) {
    throw new Error('Claude Code subscription authentication is not confirmed. Run claude auth login with your Max account and check /status. API fallback is disabled.');
  }
  return 'subscription-login';
}

// CLI policy also blocks an apiKeyHelper or API key introduced through project settings
// after preflight. Keep existing settings such as disableAllHooks intact.
export function subscriptionArgs(args) {
  const result = [...args];
  const index = result.indexOf('--settings');
  const settings = index < 0 ? {} : JSON.parse(result[index + 1]);
  const value = JSON.stringify({ ...settings, forceLoginMethod: 'claudeai' });
  if (index < 0) result.push('--settings', value);
  else result[index + 1] = value;
  if (!result.includes('--max-turns')) result.push('--max-turns', '30');
  return result;
}

export function runSubscriptionClaude(args, options = {}) {
  requireSubscription(options);
  return spawnSync('claude', subscriptionArgs(args), options);
}
