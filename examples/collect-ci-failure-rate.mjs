#!/usr/bin/env node
// Project-owned collector example. Prints a bands document on stdout.
// Uses GitHub Actions when GH_TOKEN and GITHUB_REPOSITORY are set; otherwise a quiet empty set
// so `harness monitor detect` no-ops instead of inventing a breach.
import { spawnSync } from 'node:child_process';

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!repo || !token) {
  process.stdout.write(JSON.stringify({ owner: 'unassigned', bands: [] }) + '\n');
  process.exit(0);
}

const result = spawnSync('gh', ['api', `repos/${repo}/actions/runs?per_page=30`], {
  encoding: 'utf8', env: { ...process.env, GH_TOKEN: token },
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || 'gh api failed\n');
  process.stdout.write(JSON.stringify({ owner: 'unassigned', bands: [], error: 'gh-api-failed' }) + '\n');
  process.exit(0);
}
const runs = JSON.parse(result.stdout).workflow_runs ?? [];
const done = runs.filter((r) => r.status === 'completed');
const failed = done.filter((r) => r.conclusion === 'failure').length;
const observed = done.length ? failed / done.length : 0;
process.stdout.write(JSON.stringify({
  owner: 'platform',
  bands: [{ metric: 'ci_test_failure_rate', observed, mean: 0.05, stdev: 0.05, source: 'github-actions' }],
}) + '\n');
