// Where the playbook indicators get their facts.
//
// They used to come from `lifecycle()`, which walks the pre-contract four-file chain
// intent -> spec -> plan -> review. The delivery contract replaced the middle two with sealed
// sections of one artifact, so the measurement layer was reading a model this repository had
// stopped producing, and every indicator except eval pass rate printed `unmeasured` while real
// work went through the contract chain.
//
// One row per change: the intent and its ref, the contract with the commits that sealed each
// section, and the review. Everything is dated by the commit that introduced it, because the
// audit trail is the chain of commits — an approval sitting in a working tree is not a gate.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseContract } from './contract.mjs';

function git(root, args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

function field(body, name) {
  return body.match(new RegExp(`^- \\*\\*${name}:\\*\\*\\s*(.+)$`, 'mi'))?.[1]?.replace(/<!--.*$/, '').trim() || null;
}

// Every commit that touched a file, oldest first, as [sha, isoDate] pairs.
function history(root, file) {
  const rel = path.relative(root, file);
  const out = git(root, ['log', '--follow', '--format=%H %aI', '--reverse', '--', rel]);
  return out.split('\n').filter(Boolean).map((line) => {
    const [sha, date] = line.split(' ');
    return { sha, date, rel };
  });
}

const at = (root, { sha, rel }) => git(root, ['show', `${sha}:${rel}`]);

// The first commit in which a predicate became true of the file's contents. This is the whole
// of B2: an intent ref that says `accepted` in the working tree but was never committed has no
// approval date, and therefore never counts as accepted.
function committedWhen(root, file, holds) {
  if (!existsSync(file)) return null;
  for (const commit of history(root, file)) {
    let body;
    try { body = at(root, commit); } catch { continue; }
    if (holds(body)) return commit.date;
  }
  return null;
}

function firstCommit(root, file) {
  if (!existsSync(file)) return null;
  return history(root, file)[0]?.date ?? null;
}

const refAccepted = (body) => { try { return JSON.parse(body)?.decision?.status === 'accepted'; } catch { return false; } };
const sealedWith = (scope, digest) => (body) => digest && field(body, `${scope} approval digest`) === digest;

// How many times the spec seal moved after the plan was sealed.
//
// The legacy indicator counted commits touching spec.md after plan.md was approved, which
// counted a typo fix as rework and missed a spec edited alongside something else. Spec and plan
// are sections of one file now, and each carries its own approval digest — so a spec digest that
// changes after the plan seal is the question the indicator was always asking.
// Ordered by position in history, not by clock. Git commit dates have one-second resolution, so
// a seal and a re-seal made in the same second compare equal and a `date >` test silently counts
// nothing. Position is exact and is what "after" means here anyway.
function specReworkAfterPlan(root, file, planDigest) {
  if (!existsSync(file) || !planDigest) return null;
  const commits = history(root, file);
  const specDigests = [];
  let planIndex = -1;
  for (let i = 0; i < commits.length; i++) {
    let body;
    try { body = at(root, commits[i]); } catch { specDigests.push(null); continue; }
    specDigests.push(field(body, 'Spec approval digest'));
    if (planIndex === -1 && field(body, 'Plan approval digest') === planDigest) planIndex = i;
  }
  if (planIndex === -1) return null;
  let rework = 0;
  for (let i = planIndex + 1; i < commits.length; i++) if (specDigests[i] !== specDigests[i - 1]) rework++;
  return rework;
}

function commitsAfter(root, file, since) {
  if (!existsSync(file) || !since) return null;
  return history(root, file).filter((c) => Date.parse(c.date) > Date.parse(since)).length;
}

// Contracts *and* intent refs. An intent that was closed never becomes a contract, so reading
// only the contracts directory makes every abandoned intent invisible — and intent survival,
// which is approved/(approved+closed), can then never be anything but 1.0. That is a metric
// incapable of delivering bad news.
export function slugs(L) {
  const names = (dir, ext) => (dir && existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)) : []);
  return [...new Set([...names(L?.contracts, '.md'), ...names(L?.intentRefs, '.json')])].sort();
}

export function rows(cfg, onlySlug = null) {
  const L = cfg.layout;
  const root = L.root;
  return (onlySlug ? [onlySlug] : slugs(L)).map((id) => {
    const intentFile = path.join(L.intent, `${id}.md`);
    const refFile = path.join(L.intentRefs, `${id}.json`);
    const contractFile = path.join(L.contracts, `${id}.md`);
    const reviewFile = path.join(L.review, `${id}.md`);

    let ref = null;
    try { ref = JSON.parse(readFileSync(refFile, 'utf8')); } catch { /* absent or unreadable */ }
    const meta = existsSync(contractFile) ? parseContract(readFileSync(contractFile, 'utf8')) : null;

    const acceptedAt = committedWhen(root, refFile, refAccepted);
    const specSealedAt = committedWhen(root, contractFile, sealedWith('Spec', meta?.spec_approval_digest));
    const planSealedAt = committedWhen(root, contractFile, sealedWith('Plan', meta?.plan_approval_digest));

    const reviewBody = existsSync(reviewFile) ? readFileSync(reviewFile, 'utf8') : null;
    const reviewStatus = reviewBody ? field(reviewBody, 'Status') : null;

    return {
      id,
      // The ref is the authority on the decision, and it outlives the prose: an intent closed
      // before any contract was written still has a ref, and still counts against survival.
      intent: (existsSync(intentFile) || existsSync(refFile)) ? {
        file: existsSync(intentFile) ? intentFile : refFile,
        // The playbook measures from when the work began. Where the artifact records that we use
        // it; where it does not, the first commit is the earliest defensible proxy and the number
        // is a lower bound, not a fiction.
        opened_at: (existsSync(intentFile) ? field(readFileSync(intentFile, 'utf8'), 'Opened at') : null)
          ?? firstCommit(root, existsSync(intentFile) ? intentFile : refFile),
        committed_at: firstCommit(root, existsSync(intentFile) ? intentFile : refFile),
        status: ref?.decision?.status ?? null,
        accepted_at: acceptedAt,
      } : null,
      contract: meta ? {
        file: contractFile,
        spec_status: meta.spec_status,
        plan_status: meta.plan_status,
        spec_sealed_at: specSealedAt,
        plan_sealed_at: planSealedAt,
        spec_rework_after_plan: specReworkAfterPlan(root, contractFile, meta?.plan_approval_digest),
        intent_rework_after_spec: commitsAfter(root, intentFile, specSealedAt),
      } : null,
      review: reviewBody ? {
        file: reviewFile,
        status: reviewStatus,
        committed_at: firstCommit(root, reviewFile),
        // A review that ever said `changes-requested` was not a first-pass approval, even if it
        // says `approved` now.
        ever_requested_changes: Boolean(git(root, ['log', '-S', 'changes-requested', '--format=%H', '--', path.relative(root, reviewFile)])),
      } : null,
    };
  });
}
