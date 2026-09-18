// G18. The release record: what authorises a deploy to a live environment, and for how long.
//
// It used to be `HARNESS_RELEASE_APPROVAL` — any non-empty value of an environment variable. That
// is not an authorisation, it is a spelling: it says nothing about who approved, what they
// approved, or when it stops being true. `export HARNESS_RELEASE_APPROVAL=1` in a shell profile
// disables the control permanently and silently, and nothing anywhere records that it happened.
//
// A record names a candidate, a person and an expiry. It authorises *that* commit, not "deploys in
// general", so a green review of one revision cannot be spent on a different one — which is the
// whole failure the environment variable could not even describe.
//
// It is still not authentication. `approved_by` is an audit label a human typed, exactly like
// `--by` on a gate approval, and the hook that reads this sees only the agent's commands: a
// person's own shell runs no hook. What the record adds is a decision with a subject and an end.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const DEFAULT_MINUTES = 60;
export const ROUTE = 'ask the human to run: harness release approve --by <identity>';

export const file = (cfg) => path.join(cfg.layout.state, 'release.json');

export function head(root) {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); }
  catch { return null; }
}

export function read(cfg) {
  const target = file(cfg);
  if (!existsSync(target)) return null;
  try { return JSON.parse(readFileSync(target, 'utf8')); }
  catch { return { malformed: true }; }
}

// One function answers "may this release proceed", and the answer always carries a reason and a
// route. A denial that does not say what to do next is a denial people route around.
export function state(cfg, { now = Date.now(), at = null } = {}) {
  const record = read(cfg);
  const candidate = at ?? head(cfg.layout.root);
  if (!record) return { allowed: false, reason: 'no release record', route: ROUTE, candidate };
  if (record.malformed) return { allowed: false, reason: 'the release record is not readable JSON', route: ROUTE, candidate };
  if (!record.candidate || !record.approved_by || !record.expires) {
    return { allowed: false, reason: 'the release record names no candidate, approver or expiry', route: ROUTE, candidate };
  }
  const expires = Date.parse(record.expires);
  if (!Number.isFinite(expires)) return { allowed: false, reason: 'the release record has an unreadable expiry', route: ROUTE, candidate };
  if (expires <= now) {
    return { allowed: false, reason: `the release record expired at ${record.expires}`, route: ROUTE, candidate, record };
  }
  if (!candidate) return { allowed: false, reason: 'this tree has no HEAD to compare the record against', route: ROUTE, candidate };
  if (record.candidate !== candidate) {
    return { allowed: false, candidate, record,
      reason: `the release record authorises ${record.candidate.slice(0, 12)}, and HEAD is ${candidate.slice(0, 12)}`,
      route: ROUTE };
  }
  return { allowed: true, candidate, record,
    reason: `approved by ${record.approved_by} at ${record.at}, expires ${record.expires}`, route: null };
}

export function approve(cfg, { by, minutes = DEFAULT_MINUTES, now = Date.now(), candidate = null } = {}) {
  if (!by || /[\r\n]/.test(by)) throw new Error('a release approval needs an approver: --by <identity>');
  if (!(Number.isFinite(Number(minutes)) && Number(minutes) > 0)) throw new Error('--minutes must be a positive number');
  const sha = candidate ?? head(cfg.layout.root);
  if (!sha) throw new Error('no HEAD to approve: a release authorises a commit, not a working tree');
  const record = {
    candidate: sha,
    approved_by: by,
    at: new Date(now).toISOString(),
    expires: new Date(now + Number(minutes) * 60000).toISOString(),
    note: 'An audit label and an expiry, not authentication. Delete this file or run `harness release revoke` to end it early.',
  };
  mkdirSync(path.dirname(file(cfg)), { recursive: true });
  writeFileSync(file(cfg), JSON.stringify(record, null, 2) + '\n');
  return record;
}

export function revoke(cfg) {
  const target = file(cfg);
  const existed = existsSync(target);
  rmSync(target, { force: true });
  return { revoked: existed };
}
