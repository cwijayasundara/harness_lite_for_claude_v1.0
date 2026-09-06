// Test-driver authority. Keep this object in the parent process, never in the staged repository.
// This proves a scripted protocol, not human judgment or OS isolation of arbitrary shell tools.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { approve, file, read, bodyDigest } from '../../.aidlc/lib/artifacts.mjs';

const digest = text => createHash('sha256').update(text).digest('hex');
export function approvalDriver(cfg) {
  const receipts = new Map();
  const events = [];
  const key = (slug, kind) => `${slug}/${kind}`;
  function valid(slug, kind) {
    const receipt = receipts.get(key(slug, kind));
    if (!receipt) return false;
    try {
      const artifact = read(cfg, slug, kind);
      return artifact?.state === 'approved' && digest(artifact.text) === receipt &&
        (kind !== 'plan' || (valid(slug, 'spec') && artifact.front.spec_digest === bodyDigest(read(cfg, slug, 'spec').text)));
    } catch { return false; }
  }
  return {
    decide({ slug, kind, decision, reason = '' }) {
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) || !['spec', 'plan'].includes(kind)) throw new Error('invalid simulated gate');
      if (!['approve', 'reject'].includes(decision)) throw new Error('decision must be approve or reject');
      receipts.delete(key(slug, kind));
      if (kind === 'spec') receipts.delete(key(slug, 'plan'));
      events.push({ slug, kind, decision, reason, authority: 'simulated-test-driver' });
      if (decision === 'reject') return;
      if (kind === 'plan' && !valid(slug, 'spec')) throw new Error('spec lacks current external approval');
      approve(cfg, slug, kind, { by: 'simulated-test-driver' });
      const target = file(cfg, slug, kind);
      const rel = path.relative(cfg.layout.root, target);
      execFileSync('git', ['add', '--', rel], { cwd: cfg.layout.root });
      execFileSync('git', ['commit', '--only', '-m', `Simulated approval: ${slug}/${kind}`, '--', rel], { cwd: cfg.layout.root, stdio: 'pipe' });
      receipts.set(key(slug, kind), digest(readFileSync(target, 'utf8')));
    },
    assertImplementation(slug) {
      if (!valid(slug, 'spec') || !valid(slug, 'plan')) throw new Error(`${slug}: missing, rejected, fabricated or stale external approval`);
    },
    events: () => events.map(event => ({ ...event })),
  };
}
