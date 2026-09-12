// the-harness-needs-no-container. The dependency is gone; this is what stops it coming back
// quietly. B1 and B3 assert absence over the executable surface, B4 asserts the thing that makes
// the removal safe rather than merely complete, and B5/B6 assert that nothing still describes or
// offers a boundary that no longer exists.
//
// Historical records are deliberately out of scope: docs/DEFECT-REPAIR-PLAN.md, the research
// proposal, the backlog and evals/evidence/*.json describe what was built and measured at the
// time. An eval summary reporting a container run is evidence of a container run; editing the
// word out would falsify the record rather than remove a dependency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './_paths.mjs';

const EXECUTABLE = ['evals', 'test', '.aidlc', '.github/workflows'];
const SKIP = /(^|\/)(\.git|node_modules|evidence|artifacts|state)(\/|$)/;
// B1 forbids *invoking or requiring* the runtime, which is what these match: naming it as a
// command, the helpers that built its arguments, the image identifiers, the opt-in variable and
// the socket. Prose is deliberately not matched. A comment recording why a variable is stripped,
// or the slug `the-tests-run-without-docker`, requires nothing — and banning the word outright
// would have forced an edit to `.aidlc/sensors/architecture.mjs`, whose unrelated docker-compose
// example this change does not own. The dependency cannot come back without matching one of
// these, because it cannot be invoked without being named as a command.
const FORBIDDEN = [
  /['"`][^'"`\n]*\bdocker['"`]/,   // as a command, including an absolute path to it
  /\bdocker\s+(build|run|info|ps|exec|rm|image|logs|compose)\b/i,
  /productDockerArgs/,
  /PRODUCT_IMAGE|HARNESS_PRODUCT_IMAGE/,
  /HARNESS_PRODUCT_DOCKER/,
  /docker\.sock/,
];

function sourceFiles(rel) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [rel];
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const next = `${rel}/${entry.name}`;
    if (SKIP.test(next)) continue;
    if (entry.isDirectory()) out.push(...sourceFiles(next));
    // No extension filter: `.aidlc/bin/harness` carries this project's control flow and has no
    // extension, so filtering by suffix left the one file most worth scanning unscanned.
    else if (!/\.(md|png|jpe?g|gif|ico|pdf|zip|gz|lock)$/i.test(entry.name)) out.push(next);
  }
  return out;
}

test('B1: nothing in the executable surface invokes or requires Docker', () => {
  const offenders = [];
  for (const rel of [...EXECUTABLE.flatMap(sourceFiles), '.aidlc/harness.toml']) {
    if (rel === 'test/no-container.test.mjs') continue; // names the strings in order to forbid them
    const text = readFileSync(path.join(ROOT, rel), 'utf8');
    for (const pattern of FORBIDDEN) {
      if (pattern.test(text)) offenders.push(`${rel} matches ${pattern}`);
    }
  }
  assert.deepEqual(offenders, [], `Docker has returned to the executable surface:\n${offenders.join('\n')}`);
});

test('B3: the image, the container suite and the container CI job are gone', () => {
  assert.equal(existsSync(path.join(ROOT, 'evals/Dockerfile')), false, 'evals/Dockerfile must be deleted');
  assert.equal(existsSync(path.join(ROOT, 'test/container')), false, 'test/container/ must be deleted');
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/harness.yml'), 'utf8');
  assert.ok(!workflow.includes('container-boundary'), 'the container-boundary job must be gone');
  assert.ok(!/docker build/i.test(workflow), 'no CI job may build an image');
});

test('B4: a live product trial refuses rather than running an agent on the host', async () => {
  const { claudeInvoker } = await import('../evals/lib/invoker.mjs');
  const invoke = claudeInvoker({ model: 'configured-capable-model' });
  // A sandbox argument is what a live product trial passes. There is no boundary to put it in
  // any more, so the only safe answer is refusal: falling through to `claude` would run an agent
  // with Write, Edit and Bash directly on the operator's machine.
  // Synchronous on purpose: the refusal must land before any invocation setup, so there is no
  // await to race and nothing to clean up if a caller ignores the result.
  assert.throws(
    () => invoke({ prompt: 'p', phase: 'implement', sandbox: { work: ROOT }, budgetUsd: 1 }),
    /no boundary to run in/,
    'a product invocation must refuse, naming that it has no boundary');

  // The refusal must not be over-broad: the harness's own non-product invocation — the evaluator
  // and the golden suite — has always run the CLI directly and still must. Proven without
  // spawning anything: a conflicting API key makes `requireSubscription` throw, and reaching that
  // throw at all proves execution got PAST the boundary refusal into the ordinary path.
  const previous = { ...process.env };
  try {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.ANTHROPIC_API_KEY = 'sk-fixture-never-spend';
    assert.throws(
      () => invoke({ prompt: 'p', phase: 'implement', budgetUsd: 1, cwd: ROOT }),
      /API billing is disabled/,
      'a non-product invocation must reach the ordinary path, not the boundary refusal');
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    for (const [key, value] of Object.entries(previous)) process.env[key] = value;
  }
});

// Checking three literal strings was not enough: a review found five more present-tense claims in
// evals/README.md alone ("not mounted into the agent container", "Containers need…", "Two isolated
// product campaigns"), each phrased differently and none matched. These patterns catch the SHAPE
// of the claim instead — a container that contains, a mount that separates, an adjective that
// asserts containment — because the failure mode is a document that still promises a boundary,
// not a document that uses a particular sentence.
const BOUNDARY_CLAIMS = [
  /HARNESS_PRODUCT_DOCKER/,
  /exercises isolation/i,
  /container isolation/i,
  /(agent|product|Claude) container/i,
  /container(s)? (need|receive|are|is|stop)/i,
  /not mounted|mounts no|mounted into/i,
  /isolated (product|trial|campaign|container|run)/i,
];

test('B5: the runbooks no longer describe a boundary that does not exist', () => {
  const offenders = [];
  for (const rel of ['docs/OPERATING.md', 'evals/README.md']) {
    const text = readFileSync(path.join(ROOT, rel), 'utf8');
    for (const line of text.split('\n')) {
      for (const claim of BOUNDARY_CLAIMS) {
        if (claim.test(line)) offenders.push(`${rel}: ${line.trim().slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `a runbook still claims a boundary this repository does not have:\n${offenders.join('\n')}`);
});

// B5's other half, which the first round left to prose: the source must not name a plain staged
// directory a sandbox or an isolation either. The one permitted use is evals/lib/invoker.mjs,
// where `sandbox` names the argument that TRIGGERS the refusal — there it means "a caller that
// wanted a boundary", which is exactly what it is.
test('B5: no source name calls a staged directory a sandbox or an isolation', () => {
  const offenders = [];
  for (const rel of [...['evals', 'test'].flatMap(sourceFiles)]) {
    if (rel === 'test/no-container.test.mjs' || rel === 'evals/lib/invoker.mjs') continue;
    for (const [n, line] of readFileSync(path.join(ROOT, rel), 'utf8').split('\n').entries()) {
      // Scoped to DECLARATIONS, which is the claim B5 is actually about: naming a thing a sandbox.
      // Handing `sandbox:` to the invoker is the permitted use — it names the argument that
      // triggers the refusal, so the caller is saying "this wanted a boundary", which is true.
      // Matching those too would flag every call site and force the test to guess at intent from
      // line shape, which it did, wrongly, on three continuation lines.
      if (/\b(isolateStage|sandboxFixture)\b/.test(line)
        || /\b(const|let|var|function|class)\s+\w*[Ss]andbox/.test(line)) {
        offenders.push(`${rel}:${n + 1}: ${line.trim().slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `a name still calls something a sandbox that is not one:\n${offenders.join('\n')}`);
});

test('B6: one execution path remains, with no mode argument and no container helper', async () => {
  const stageModule = await import('../evals/lib/stage.mjs');
  assert.equal(stageModule.productDockerArgs, undefined, 'productDockerArgs must not be exported');
  assert.equal(stageModule.PRODUCT_IMAGE, undefined, 'PRODUCT_IMAGE must not be exported');
  assert.ok(!/\bexec\b\s*[:=]/.test(stageModule.stage.toString().split('\n')[0]),
    'stage() must not take an exec mode when only one path exists');
});
