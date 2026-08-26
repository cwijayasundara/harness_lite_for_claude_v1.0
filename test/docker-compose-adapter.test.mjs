import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DockerComposeAdapter } from '../.aidlc/providers/docker-compose.mjs';

const DIGEST = `sha256:${'c'.repeat(64)}`;

test('Docker Compose adapter executes the six fixed platform operations against one immutable image', async () => {
  const calls = []; const requests = [];
  const run = (argv, env) => {
    calls.push({ argv, image: env.AIDLC_IMAGE, project: env.COMPOSE_PROJECT_NAME });
    if (argv[1] === 'info') return { status: 0, stdout: '27.1.0\n', stderr: '' };
    if (argv.includes('ps')) return { status: 0, stdout: JSON.stringify([{ Service: 'api', State: 'running', Health: 'healthy' }]), stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  const adapter = new DockerComposeAdapter({ root: '/repo', compose_file: 'compose.yaml', service: 'api', image_repository: 'registry.invalid/api', project_slug: 'checkout', verify_url_staging: 'https://staging.invalid/health' }, {
    run, request: async (url) => { requests.push(url); return { ok: true, status: 200 }; },
  });
  const preflight = await adapter.execute('preflight', 'staging', DIGEST, {});
  const deployed = await adapter.execute('deploy', 'staging', DIGEST, {});
  const status = await adapter.execute('status', 'staging', null, {});
  const verified = await adapter.execute('verify', 'staging', DIGEST, {});
  const promoted = await adapter.execute('promote', 'production', DIGEST, {});
  const rolled = await adapter.execute('rollback', 'staging', DIGEST, {});
  assert.equal(preflight.daemon, '27.1.0'); assert.equal(status.running, true); assert.equal(verified.running, true);
  assert.equal(requests[0], 'https://staging.invalid/health');
  for (const result of [preflight, deployed, verified, promoted, rolled]) assert.equal(result.image, `registry.invalid/api@${DIGEST}`);
  assert.ok(calls.filter((call) => call.argv.includes('up')).every((call) => call.argv.includes('--no-build') && call.argv.includes('--wait')));
  assert.ok(calls.every((call) => call.argv[0] === 'docker'));
});

test('Docker Compose adapter fails closed on mutable artifacts, unhealthy services, and invented operations', async () => {
  const adapter = new DockerComposeAdapter({ root: '/repo', compose_file: 'compose.yaml', service: 'api', image_repository: 'registry.invalid/api' }, {
    run: (argv) => argv.includes('ps') ? { status: 0, stdout: JSON.stringify([{ State: 'running', Health: 'unhealthy' }]), stderr: '' } : { status: 0, stdout: '', stderr: '' },
  });
  await assert.rejects(() => adapter.execute('deploy', 'staging', 'latest', {}), /immutable sha256/);
  await assert.rejects(() => adapter.execute('verify', 'staging', DIGEST, {}), /not healthy/);
  await assert.rejects(() => adapter.execute('shell', 'staging', DIGEST, {}), /unsupported/);
});
