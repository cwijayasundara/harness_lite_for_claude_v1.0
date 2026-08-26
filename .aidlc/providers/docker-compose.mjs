#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { findRepoRoot } from '../lib/paths.mjs';

const safe = (value) => typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(value);
const digest = (value) => /^sha256:[a-f0-9]{64}$/.test(value ?? '');

function parsePs(text) {
  const body = String(text ?? '').trim(); if (!body) return [];
  try { const value = JSON.parse(body); return Array.isArray(value) ? value : [value]; }
  catch { return body.split('\n').filter(Boolean).map((line) => JSON.parse(line)); }
}

export class DockerComposeAdapter {
  constructor(config, { run, request } = {}) {
    this.config = config;
    this.run = run ?? ((argv, env) => spawnSync(argv[0], argv.slice(1), { cwd: config.root, env, encoding: 'utf8', timeout: Number(config.timeout_ms ?? 300000) }));
    this.request = request ?? ((url, options) => fetch(url, options));
  }

  validate(operation, environment, artifact) {
    const issues = [];
    if (!['preflight', 'deploy', 'status', 'verify', 'promote', 'rollback'].includes(operation)) issues.push('unsupported Docker Compose operation');
    if (!safe(environment)) issues.push('environment must be a canonical slug');
    if (!this.config.compose_file || !this.config.service || !this.config.image_repository) issues.push('compose_file, service, and image_repository are required');
    if (operation !== 'status' && !digest(artifact)) issues.push('HARNESS_ARTIFACT_DIGEST must be immutable sha256');
    return issues;
  }

  async execute(operation, environment, artifact, inherited = process.env) {
    const issues = this.validate(operation, environment, artifact); if (issues.length) throw new Error(issues.join('; '));
    const docker = this.config.docker_bin || 'docker'; const project = `${this.config.project_slug || 'aidlc'}-${environment}`;
    const image = `${this.config.image_repository}@${artifact}`;
    const env = { ...inherited, AIDLC_IMAGE: image, COMPOSE_PROJECT_NAME: project };
    const base = [docker, 'compose', '-f', this.config.compose_file, '-p', project];
    const invoke = (args) => {
      const result = this.run([...base, ...args], env);
      if (result.error || result.status !== 0) throw new Error(String(result.stderr || result.error?.message || `docker exited ${result.status}`).trim());
      return String(result.stdout ?? '');
    };
    if (operation === 'preflight') {
      const info = this.run([docker, 'info', '--format', '{{.ServerVersion}}'], env);
      if (info.error || info.status !== 0) throw new Error(String(info.stderr || info.error?.message || 'Docker daemon unavailable').trim());
      invoke(['config', '-q']); return { platform: 'docker-compose', daemon: String(info.stdout).trim(), image };
    }
    if (['deploy', 'promote', 'rollback'].includes(operation)) {
      invoke(['up', '-d', '--no-build', '--wait', this.config.service]); return { platform: 'docker-compose', project, service: this.config.service, image };
    }
    const containers = parsePs(invoke(['ps', '--format', 'json', this.config.service]));
    const running = containers.length > 0 && containers.every((item) => String(item.State ?? item.state).toLowerCase() === 'running');
    if (operation === 'status') return { platform: 'docker-compose', project, running, containers };
    if (!running) throw new Error('service is not running');
    const unhealthy = containers.some((item) => item.Health && String(item.Health).toLowerCase() !== 'healthy');
    if (unhealthy) throw new Error('service health check is not healthy');
    const url = this.config[`verify_url_${environment}`] || this.config.verify_url;
    if (url) {
      if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/.test(url) && !/^https:\/\//.test(url)) throw new Error('verify URL must use HTTPS unless it is localhost');
      const response = await this.request(url, { signal: AbortSignal.timeout(Number(this.config.verify_timeout_ms ?? 10000)) });
      if (!response.ok) throw new Error(`verification endpoint returned ${response.status}`);
    }
    return { platform: 'docker-compose', project, running: true, image, verified_url: url ?? null };
  }
}

async function main() {
  const [operation, environment] = process.argv.slice(2); const cfg = loadConfig(findRepoRoot());
  const adapter = new DockerComposeAdapter({ ...cfg.deployment, root: cfg.layout.root });
  const result = await adapter.execute(operation, environment, process.env.HARNESS_ARTIFACT_DIGEST);
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) main().catch((error) => { console.error(error.message); process.exit(1); });
