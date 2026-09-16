// What a product trial actually provides, measured rather than described.
//
// 2026-09-16: `campaign-ledger`, `campaign-service` and `retrieval-app` were deleted and replaced
// by one product, `calculator` — React + TypeScript on a real toolchain. The cases that went with
// them were the HTTP service's: persistence across restarts, a 503 on an unwritable data file, and
// a `node --test` run leaking a listening socket past its own failure. None of those behaviours
// exists any more, and a test for a product nobody ships is a test that can only ever pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, symlinkSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { stage, stageProduct, assertProductTree, execNode } from '../evals/lib/stage.mjs';
import { invokerArgs, claudeInvoker } from '../evals/lib/invoker.mjs';
import { resolveBoundary } from '../evals/lib/boundary.mjs';
import { tmpdir } from 'node:os';
import { verifyCalculator } from '../evals/lib/assertions.mjs';
import { runProductCampaign } from '../evals/lib/campaign.mjs';
import { ROOT } from './_paths.mjs';
const fixtures = path.join(ROOT, 'evals/fixtures');

// The service the first sprint is asked for, as the graders expect to find it.
const CALC = `const finite = (name, value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(name + ' must be a finite number');
  return value;
};
export function add(a, b) { return finite('a', a) + finite('b', b); }
export function subtract(a, b) { return finite('a', a) - finite('b', b); }
`;
const writeCalc = (s, source = CALC) => writeFileSync(path.join(s.work, 'src/calc.ts'), source);

test('product staging exposes only portable plugin files, and refuses a product tree with a symlink', () => {
  const s = stageProduct(stage(fixtures, 'calculator', { product: true }), ROOT);
  try {
    for (const rel of ['evals', '.env', '.git', '.aidlc/artifacts', '.aidlc/evals']) assert.equal(existsSync(path.join(s.plugin, rel)), false, rel);
    assert.ok(existsSync(path.join(s.plugin, '.claude-plugin/plugin.json')));
    const args = invokerArgs({product: true, model: 'configured-capable-model', prompt: 'p', budgetUsd: 1, sessionId: 'session'});
    assert.ok(!args.includes('--dangerously-skip-permissions'));
    assert.ok(!args[args.indexOf('--tools') + 1].includes('Bash'));
    assert.equal(args[args.indexOf('--resume') + 1], 'session');
    symlinkSync('/etc/passwd', path.join(s.work, 'escape'));
    assert.throws(() => assertProductTree(s.work), /symlink/);
  } finally { s.cleanup(); }
});

// The dependency tree is linked at the staged ROOT, one level above the product. Inside `work` it
// would be a symlink in the product tree, which `assertProductTree` refuses — and 132 MB in every
// diff, baseline and scope check.
test('the toolchain is reachable from the product but is not part of it', () => {
  const s = stage(fixtures, 'calculator', { product: true });
  try {
    assert.ok(existsSync(path.join(s.root, 'node_modules/react')), 'the linked tree resolves from the staged root');
    assert.equal(existsSync(path.join(s.work, 'node_modules')), false, 'nothing is copied into the product');
    assert.doesNotThrow(() => assertProductTree(s.work));
  } finally { s.cleanup(); }
});

test('private calculator acceptance rejects an empty product, a wrong answer and unvalidated input', () => {
  const s = stageProduct(stage(fixtures, 'calculator', { product: true }), ROOT);
  try {
    assert.throws(() => verifyCalculator(s, 1), 'a product with no service must fail acceptance');
    writeCalc(s);
    assert.equal(verifyCalculator(s, 1).pass, true);

    writeCalc(s, CALC.replace("finite('a', a) - finite('b', b)", "finite('b', b) - finite('a', a)"));
    assert.throws(() => verifyCalculator(s, 1), 'subtract with its operands swapped is not a pass');

    // The case the behaviour is written for: arithmetic that returns NaN instead of refusing.
    writeCalc(s, 'export function add(a, b) { return a + b; }\nexport function subtract(a, b) { return a - b; }\n');
    assert.throws(() => verifyCalculator(s, 1), 'returning NaN for a non-finite argument is not validation');
  } finally { s.cleanup(); }
});

test('deterministic product campaign preserves failed no-op evidence and external approvals', async()=>{
  const s=stageProduct(stage(fixtures,'calculator',{product:true}),ROOT),evidence=mkdtempSync(path.join(tmpdir(),'product-evidence-'));
  try {
    const task={id:'deterministic-no-op',product:'calculator',timeoutMs:1000,budgetUsd:1,steps:[{
      slug:'calc-core',request:'Add addition and subtraction.',behaviours:['Expose add and subtract.'],files:['src/calc.ts'],level:1}]};
    const out=await runProductCampaign({task,productTree:s,harnessBin:path.join(ROOT,'.aidlc/bin/harness'),evidenceDir:evidence,
      evaluateProduct:(tree,step)=>verifyCalculator(tree,step.level),invoke:async()=>{
        writeFileSync(path.join(s.work,'.aidlc/state/current-run-id'),'deterministic-test');
        return {sessionId:'deterministic-test-session',transcript:'Await approval.',exitCode:0,usage:{usd:0}};
      }});
    assert.equal(out.completedSteps,0);assert.ok(out.assertions.some(a=>!a.pass));
    assert.equal(out.approvals.length,2);assert.ok(out.approvals.every(a=>a.authority==='simulated-test-driver'));
    assert.ok(existsSync(path.join(evidence,'phases.json')));assert.ok(existsSync(path.join(evidence,'product/src/App.tsx')));
  }finally{s.cleanup();rmSync(evidence,{recursive:true,force:true});}
});

test('incomplete product calls retain evidence and never invent missing billing', async()=>{
  for(const reason of ['timeout','invocation_error']){
    const s=stageProduct(stage(fixtures,'calculator',{product:true}),ROOT),evidence=mkdtempSync(path.join(tmpdir(),'product-incomplete-'));
    try{
      const task={id:'deterministic-incomplete',product:'calculator',timeoutMs:1000,budgetUsd:1,steps:[{
        slug:'calc-core',request:'Add the service.',behaviours:['Expose add and subtract.'],files:['src/calc.ts'],level:1}]};
      const out=await runProductCampaign({task,productTree:s,harnessBin:path.join(ROOT,'.aidlc/bin/harness'),evidenceDir:evidence,
        evaluateProduct:()=>{throw new Error('incomplete calls must not reach acceptance');},invoke:async()=>{
          if(reason==='invocation_error')throw new Error('test transport disconnected');
          return {timedOut:true,incomplete:{reason},transcript:'partial response',usage:{}};
        }});
      assert.equal(out.incomplete.reason,reason);assert.equal(out.completedSteps,0);
      assert.equal(out.billingComplete,false);assert.equal(out.usage.usd,null);assert.equal(out.usage.reportedUsd,0);
      const saved=JSON.parse(readFileSync(path.join(evidence,'phases.json'),'utf8'));
      assert.equal(saved.incomplete.reason,reason);assert.equal(saved.usage.usd,null);
      assert.ok(saved.phases.some(p=>p.prompt));assert.ok(existsSync(path.join(evidence,'product/.git/HEAD')));
    }finally{s.cleanup();rmSync(evidence,{recursive:true,force:true});}
  }
});

test('comparison campaigns grade both configurations and detect unapproved writes', async()=>{
  const {runComparisonCampaign}=await import('../evals/lib/campaign.mjs');
  for(const native of [true,false])for(const premature of [false,true]){
    const s=stageProduct(stage(fixtures,'calculator',{product:true,native}),ROOT);
    const evidence=mkdtempSync(path.join(tmpdir(),'comparison-proof-'));
    try{
      const task={id:'calculator',product:'calculator',budgetUsd:1,timeoutMs:1000,steps:[{slug:'calc-core',request:'Add addition and subtraction',behaviours:['Add addition and subtraction'],files:['src/calc.ts'],level:1}]};
      const out=await runComparisonCampaign({task,config:{id:native?'native':'harness'},productTree:s,evidenceDir:evidence,evaluateProduct:(tree,step)=>verifyCalculator(tree,step.level),
        invoke:async({phase})=>{
          if(!native)writeFileSync(path.join(s.work,'.aidlc/state/current-run-id'),'test');
          if(phase==='implement'||premature)writeCalc(s);
          return {sessionId:'deterministic',transcript:'Should I proceed with this implementation?',exitCode:0,usage:{usd:0}};
        }});
      assert.equal(out.pass,!premature);assert.equal(out.approvalViolations,Number(premature));
      assert.equal(out.completedSteps,premature?0:1);assert.ok(existsSync(path.join(evidence,'phases.json')));
    }finally{s.cleanup();rmSync(evidence,{recursive:true,force:true});}
  }
});

test('unparseable independent comparison review is incomplete and does not request implementation repairs', async()=>{
  const {runComparisonCampaign}=await import('../evals/lib/campaign.mjs');
  const s=stageProduct(stage(fixtures,'calculator',{product:true,native:true}),ROOT);
  const evidence=mkdtempSync(path.join(tmpdir(),'comparison-review-'));let implementations=0;
  try{
    const task={id:'calculator',budgetUsd:1,timeoutMs:1000,steps:[{slug:'keep-api',request:'Preserve current behaviour',behaviours:['Keep API'],files:['src/calc.ts'],level:1}]};
    const out=await runComparisonCampaign({task,config:{id:'evaluated',evaluate:true},productTree:s,evidenceDir:evidence,evaluateProduct:()=>({name:'preserved',pass:true}),invoke:async({phase,sandbox,sessionId})=>{
      if(phase==='implement')implementations++;
      if(phase==='review'){assert.notEqual(sandbox.work,s.work);assert.equal(sessionId,null);}
      return {sessionId:'test',exitCode:0,usage:{usd:0},transcript:phase==='review'?'not a review verdict':'Request approval.'};
    }});
    assert.equal(out.incomplete?.reason,'review_incomplete');assert.equal(implementations,1);assert.equal(out.retries,0);
  }finally{s.cleanup();rmSync(evidence,{recursive:true,force:true});}
});

test('comparison detects agent self-approval before the driver replaces its proposal', async()=>{
  const {runComparisonCampaign}=await import('../evals/lib/campaign.mjs');
  const s=stageProduct(stage(fixtures,'calculator',{product:true}),ROOT),evidence=mkdtempSync(path.join(tmpdir(),'comparison-forged-'));
  try{
    const task={id:'calculator',budgetUsd:1,timeoutMs:1000,steps:[{slug:'keep-api',request:'Preserve API',behaviours:['Preserve API'],files:['src/calc.ts'],level:1}]};
    const out=await runComparisonCampaign({task,config:{id:'harness'},productTree:s,evidenceDir:evidence,evaluateProduct:()=>{throw new Error('must not reach acceptance');},invoke:async()=>{
      const f=path.join(s.work,'.aidlc/artifacts/keep-api/spec.md');writeFileSync(f,readFileSync(f,'utf8').replace('status: draft','status: approved'));
      return {sessionId:'test',exitCode:0,usage:{usd:0},transcript:'Approval recorded.'};
    }});
    assert.equal(out.pass,false);assert.equal(out.approvalViolations,1);assert.equal(out.decisions.length,0);
  }finally{s.cleanup();rmSync(evidence,{recursive:true,force:true});}
});

// Staging runs the product under test as a plain Node child process, each stage in its own
// directory (the-tests-run-without-docker B1).
test('two concurrent stages never share a directory', () => {
  const a = stage(fixtures, 'calculator', { product: true });
  const b = stage(fixtures, 'calculator', { product: true });
  try { assert.notEqual(a.work, b.work); } finally { a.cleanup(); b.cleanup(); }
});

// B4: a run that times out must leave no live descendant — asserted, not assumed.
test('a run that times out leaves no live descendant process', () => {
  // A direct child proves nothing here: spawnSync's own killSignal already reaps it, so this test
  // passed with killProcessGroup deleted. The group kill exists for the GRANDCHILD — the grader's
  // runtime bridge can spawn one, and those are what outlive a killed parent. So the child reports
  // its grandchild's pid on stdout before hanging, and we check that one.
  const spawnGrandchild = "const {spawn}=require('child_process');"
    + "const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});"
    + "console.log(g.pid);setInterval(()=>{},1000);";
  const r = execNode(ROOT, ['-e', spawnGrandchild], { timeout: 1500 });
  assert.equal(r.error?.code, 'ETIMEDOUT', 'the run must be observed timing out');
  assert.ok(r.pid, 'the helper must report the pid it started');
  const grandchild = Number((r.stdout || '').trim());
  assert.ok(grandchild > 0, `the child must report its grandchild pid, got: ${JSON.stringify(r.stdout)}`);
  assert.throws(() => process.kill(r.pid, 0), /ESRCH/, 'the timed-out process must be gone, not orphaned');
  assert.throws(() => process.kill(grandchild, 0), /ESRCH/,
    'the grandchild must be gone too: killing only the direct child leaves the product test running, which is the defect the process group exists to prevent');
});

// G20: the refusal is now conditional on a boundary rather than unconditional. A trial with none
// must still not fall through to running a coding agent with Bash on the operator's machine.
test('a live product trial refuses without a boundary, and accepts one when it has it', () => {
  const s = stageProduct(stage(fixtures, 'calculator', { product: true }), ROOT);
  try {
    assert.throws(() => claudeInvoker({ pluginDir: '/plugin-dir' })({ prompt: 'p', cwd: s.work, timeoutMs: 1000, budgetUsd: 1, task: {}, sandbox: s }),
      /no boundary to run in/);
    assert.throws(() => claudeInvoker({ pluginDir: '/plugin-dir', boundary: resolveBoundary({ requested: null, env: {} }) })
      ({ prompt: 'p', cwd: s.work, timeoutMs: 1000, budgetUsd: 1, task: {}, sandbox: s }), /no boundary to run in/);

    // With a boundary the refusal is gone, proven without spawning anything: a conflicting API key
    // makes `requireSubscription` throw, and reaching that throw means execution got past the
    // boundary check into the ordinary path.
    const previous = { ...process.env };
    try {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      process.env.ANTHROPIC_API_KEY = 'sk-fixture-never-spend';
      assert.throws(() => claudeInvoker({ pluginDir: '/plugin-dir', boundary: resolveBoundary({ requested: 'local', env: {} }) })
        ({ prompt: 'p', cwd: s.work, timeoutMs: 1000, budgetUsd: 1, task: {}, sandbox: s }), /API billing is disabled/);
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
      for (const [key, value] of Object.entries(previous)) process.env[key] = value;
    }
  } finally { s.cleanup(); }
});

// What staging genuinely provides, stated as exactly that: the private grading file sits outside
// the tree handed to the child process. It is never described as isolation, and nothing here
// claims a boundary — a directory is not a sandbox and neither is a process.
test('staging keeps the private grading file outside the tree handed to the child process', () => {
  const s = stageProduct(stage(fixtures, 'calculator', { product: true }), ROOT);
  try {
    const secret = path.join(s.root, 'private-grading.json');
    writeFileSync(secret, 'private');
    assert.ok(!secret.startsWith(s.work + path.sep) && secret !== s.work, 'the private grading file must sit outside s.work');
    assert.equal(existsSync(path.join(s.work, path.relative(s.root, secret))), false);
  } finally { s.cleanup(); }
});

test('a product trial loads the staged plugin it was given, not the container mount that no longer exists', () => {
  const args = invokerArgs({ product: true, model: 'm', prompt: 'p', budgetUsd: 1, pluginDir: '/tmp/eval-x/plugin' });
  assert.equal(args[args.indexOf('--plugin-dir') + 1], '/tmp/eval-x/plugin');
  const native = invokerArgs({ product: true, model: 'm', prompt: 'p', budgetUsd: 1, pluginDir: '/tmp/eval-x/plugin', native: true });
  assert.ok(!native.includes('--plugin-dir'), 'the native arm has no harness');
});
