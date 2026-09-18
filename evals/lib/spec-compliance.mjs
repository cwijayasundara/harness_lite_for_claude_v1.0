// G22. Does the product actually do what its approved specs say, and has it stopped doing what a
// superseded one said?
//
// The deterministic product assertions answer "does the endpoint behave": they call it and check
// the response. They cannot answer the other half — whether every approved `### B<n>` is observable
// at all, and whether a behaviour a later sprint reversed is still being presented as current.
// A reversed rule is exactly that shape: the old rule is superseded, and a product that
// still documents the old rule passes every endpoint check while telling its users something that
// is no longer true.
//
// So this is a judgment, and it is made by a model. Three things keep it honest:
//
//   * It never replaces a deterministic assertion. It is recorded beside them. A rubric that could
//     override an endpoint check would be a way to argue a failing product into passing.
//   * Three votes, majority of two. One sample of a model judgment is a coin with an opinion.
//   * The votes are stored, not just the verdict. A 2-1 and a 3-0 are different amounts of
//     evidence, and a reader who cannot tell them apart is reading a number that hides its own
//     uncertainty.

import { promiseSpecs, behavioursOf } from '../../.claude/harness/lib/artifacts.mjs';
import path from 'node:path';

export const VOTES = 3;
export const MAJORITY = 2;

// Every behaviour the product is currently promising, and every one it has stopped promising.
// `supersedes:` on an approved spec is the declaration a later sprint makes; the superseded
// behaviour's own spec is never edited, so this is the only place the reversal is written down.
export function promises(root) {
  const cfg = { layout: { root, artifacts: path.join(root, '.claude/harness', 'artifacts') } };
  const current = [];
  const superseded = [];
  for (const spec of promiseSpecs(cfg)) {
    for (const id of behavioursOf(spec.body)) current.push({ slug: spec.slug, id: `${spec.slug}#${id}` });
    for (const line of (spec.front.supersedes ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
      superseded.push({ by: spec.slug, id: line });
    }
  }
  const dead = new Set(superseded.map((s) => s.id));
  return {
    current: current.filter((b) => !dead.has(b.id)),
    superseded,
    // A behaviour that is both promised and superseded is the interesting case, and it is not an
    // error: the spec that stated it is history, and the spec that reversed it is current.
    reversed: current.filter((b) => dead.has(b.id)),
  };
}

export function rubric(root, { sprint = null } = {}) {
  const { current, superseded } = promises(root);
  return [
    'You are grading whether a product matches the behaviours its team approved.',
    sprint ? `This is sprint ${sprint}.` : '',
    '',
    'Two questions, both about the product as it stands in this directory:',
    '',
    '1. Is every approved behaviour below observable in the product — in its code, its responses,',
    '   its documentation and its tests? A behaviour nobody can observe has not been delivered,',
    '   whatever the commit history says.',
    '2. Is any superseded behaviour still presented as current? A rule that a later sprint reversed',
    '   must not still be documented, commented, or asserted as though it holds. This is the half',
    '   an endpoint check cannot see: the endpoint can be right while the README is wrong.',
    '',
    'Approved and current:',
    ...current.map((b) => `  - ${b.id}`),
    '',
    superseded.length ? 'Superseded — these must NOT be presented as current:' : 'Nothing has been superseded yet.',
    ...superseded.map((s) => `  - ${s.id} (reversed by ${s.by})`),
    '',
    'Answer with a single line: PASS if both questions are satisfied, FAIL otherwise, then one',
    'sentence naming the file and the behaviour that decided it. Read the product; do not assume.',
  ].filter((line) => line !== '').join('\n');
}

// A vote is PASS or FAIL, and anything else is a vote that did not happen. A model that returned
// prose without a verdict has not graded anything, and counting it as either answer would be
// inventing the judgment this exists to obtain.
export function readVote(transcript) {
  const text = String(transcript ?? '');
  const fail = /\bFAIL\b/.test(text);
  const pass = /\bPASS\b/.test(text);
  if (fail === pass) return { vote: null, detail: text.trim().slice(0, 300) };
  return { vote: fail ? 'fail' : 'pass', detail: text.trim().slice(0, 300) };
}

export function tally(votes) {
  const counted = votes.filter((v) => v.vote);
  const pass = counted.filter((v) => v.vote === 'pass').length;
  const fail = counted.filter((v) => v.vote === 'fail').length;
  // Majority of the votes that were cast, and unmeasured when too few were. Two of three is the
  // bar; two of two is also two, and one of one is not a majority of anything.
  if (counted.length < MAJORITY) return { verdict: 'unmeasured', pass, fail, votes, why: `${counted.length} of ${votes.length} votes were readable` };
  if (pass >= MAJORITY) return { verdict: 'pass', pass, fail, votes };
  if (fail >= MAJORITY) return { verdict: 'fail', pass, fail, votes };
  return { verdict: 'unmeasured', pass, fail, votes, why: 'no majority' };
}

// `invoke` is the eval invoker; `root` is the staged product. Recorded beside the deterministic
// assertions by the caller, never in place of them.
export async function gradeSpecCompliance({ root, invoke, model, sprint = null, budgetUsd = 0.5, votes = VOTES }) {
  const prompt = rubric(root, { sprint });
  const cast = [];
  for (let i = 0; i < votes; i++) {
    const out = await invoke({ prompt, cwd: root, model, budgetUsd, phase: 'review', timeoutMs: 120000 });
    cast.push({ ...readVote(out?.transcript), usd: out?.usage?.usd ?? null });
  }
  return { name: 'spec-compliance', sprint, ...tally(cast), rubric: prompt };
}
