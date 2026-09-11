import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdtempSync,rmSync,renameSync,utimesSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {comparisonPairs,summarizeComparisons,configureComparison,pruneSessionInventory,restoreSessionInventory,runComparisons} from '../evals/lib/comparison.mjs';
import {stage,isolateStage,FIXTURES} from '../evals/lib/stage.mjs';
import {invokerArgs} from '../evals/lib/invoker.mjs';
import {ledgerDescriptionExplainsPaidRule} from '../evals/lib/assertions.mjs';
import {loadConfig} from '../.aidlc/lib/config.mjs';
import {ensure,load} from '../.aidlc/lib/graph.mjs';
import {refresh} from '../.aidlc/lib/refresh.mjs';
import {boundedSearch,bench} from '../evals/bench/pack-bench.mjs';
const root=path.resolve('.');
const models={generator:'capable',evaluator:'strong',evals:'economical'};

test('paid-rule description accepts the saved explicit paid conditional without accepting its reversal',()=>{
  const doc='**Overdue Rule:** An invoice is overdue if its due date has passed AND it is not fully paid.\n- If fully paid (amountCents === amountPaid): returns false, even if due date is in the past\n- If partially or unpaid and due date is before today: returns true';
  assert.equal(ledgerDescriptionExplainsPaidRule(doc),true);
  assert.equal(ledgerDescriptionExplainsPaidRule(doc.replace('returns false','returns true')),false);
  assert.equal(ledgerDescriptionExplainsPaidRule('If not fully paid (amountCents !== amountPaid): returns false'),false);
});

test('the retrieval pair is reachable only by name and never hands an arm a pack',()=>{
  // graph-first-versus-grep-first B1. A default --compare run must keep costing what it costs.
  assert.deepEqual(comparisonPairs(models).map(p=>p.id),['native','graph','generation']);
  const [pair]=comparisonPairs(models,{pair:'retrieval'});
  assert.equal(pair.id,'retrieval');
  assert.deepEqual(pair.arms.map(a=>a.id),['grep-first','graph-first']);
  assert.equal(pair.arms[0].model,pair.arms[1].model,'only retrieval differs between the arms');
  assert.equal(pair.arms[0].graphFirst,undefined,'the control is the configuration without-graph has always run');
  assert.equal(pair.arms[1].graphFirst,true);
  assert.equal(pair.arms.some(a=>a.graph),false,'neither arm is handed an injected pack');
  assert.throws(()=>comparisonPairs(models,{pair:'retrieval',prune:true}),/without --prune/);

  // The campaign swaps the retrieval sentence and pastes nothing.
  const campaign=readFileSync('evals/lib/campaign.mjs','utf8');
  assert.match(campaign,/config\.graphFirst/);
  assert.match(campaign,/rg and bounded reads are the miss path/);
  assert.match(campaign,/Use rg and bounded reads as needed\./,'the control keeps its instruction');
  const branch=campaign.slice(campaign.indexOf('if(config.graphFirst)'),campaign.indexOf('const instruction='));
  assert.doesNotMatch(branch,/renderPack/,'the graph-first arm must not be handed a pack');

  // And the arm keeps a real index: suppression stays for every other harness arm.
  const comparison=readFileSync('evals/lib/comparison.mjs','utf8');
  const configure=comparison.slice(comparison.indexOf('export function configureComparison'),comparison.indexOf('export async function gradeComparisonProduct'));
  assert.match(configure,/if\(config\.graphFirst\)return;/);
  assert.ok(configure.indexOf('if(config.graphFirst)return;')<configure.indexOf('graph.mjs'),
    'the exemption must precede the suppression it exempts');
});

test('a do-nothing model fails every assertion the retrieval product is graded on',async()=>{
  // graph-first-versus-grep-first B2. Proved against the unmodified fixture directly, so it needs
  // no Docker: evals/tasks.json still names test/rehearsal.test.mjs for this, and that file is gone.
  const fx='../evals/fixtures/retrieval-app';
  const {rollup}=await import(`${fx}/src/reporting/aggregate.mjs`);
  const {render}=await import(`${fx}/src/reporting/summary.mjs`);
  const {format:money}=await import(`${fx}/src/billing/invoices.mjs`);
  const {format:row}=await import(`${fx}/src/reporting/summary.mjs`);

  const entries=[{isoDate:'2026-01-04',amountCents:1000},{isoDate:'2026-02-20',amountCents:500}];
  assert.throws(()=>rollup(entries,'quarter'),/unsupported period/,'level 1 must be red before the change');
  assert.ok(!render([{period:'2026-Q1',count:2,totalCents:1500}]).includes('$15.00'),
    'level 2 must be red before the change');

  // The reason this product exists: two modules export `format`, and they are not the same one.
  assert.notEqual(money,row,'a lookup that stops at its first match answers the wrong question');
  assert.equal(money(1000),'$10.00');
  assert.ok(!row({period:'p',count:1,totalCents:1}).includes('$'));

  // And the grader reaches it.
  const comparison=readFileSync('evals/lib/comparison.mjs','utf8');
  assert.match(comparison,/if\(product==='reporting'\)return verifyReporting/);
});

test('comparison pairs hold models constant, sequence graph then evaluated generation, and reject missing models',()=>{
  const pairs=comparisonPairs(models);
  assert.deepEqual(pairs.map(p=>p.id),['native','graph','generation']);
  assert.equal(pairs[0].arms[0].model,pairs[0].arms[1].model);
  assert.equal(pairs[1].arms[0].model,pairs[1].arms[1].model);
  assert.equal(pairs[2].arms[1].evaluate,true);
  assert.throws(()=>comparisonPairs({generator:'capable'}),/no substitution/);
});

test('native staging has normal instructions, public tests and no harness plugin or private inputs',()=>{
  const s=stage(FIXTURES,'campaign-ledger',{product:true,native:true});
  try{
    isolateStage(s,root);assert.ok(existsSync(path.join(s.work,'CLAUDE.md')));
    assert.ok(!existsSync(path.join(s.work,'.aidlc')));assert.ok(!existsSync(path.join(s.work,'.claude')));
    assert.ok(!existsSync(path.join(s.work,'products.json')));
    assert.ok(!existsSync(path.join(s.work,'plugin')),'the native arm gets no harness plugin');
    const args=invokerArgs({product:true,native:true,comparison:true,model:'capable',budgetUsd:1});
    assert.ok(!args.includes('--plugin-dir'));assert.equal(args[args.indexOf('--allowedTools')+1],'Bash');
    const review=invokerArgs({product:true,review:true,comparison:true,model:'strong',budgetUsd:1});
    assert.ok(!review.join(' ').includes('Bash'));assert.ok(review.includes('--safe-mode'));
  }finally{s.cleanup();}
});

test('comparison graph suppression changes only disposable plugin and leaves normal source readable',()=>{
  const original=readFileSync('.aidlc/lib/graph.mjs','utf8');
  const s=stage(FIXTURES,'campaign-ledger',{product:true});
  try{isolateStage(s,root);configureComparison(s);
    assert.match(readFileSync(path.join(s.plugin,'.aidlc/lib/graph.mjs'),'utf8'),/load\(cfg\) \{ return null/);
    assert.equal(readFileSync('.aidlc/lib/graph.mjs','utf8'),original);
    assert.ok(existsSync(path.join(s.work,'src/ledger.mjs')));
  }finally{s.cleanup();}
});

test('comparison totals include failed spend, partial accepted changes and unknown billing',()=>{
  const make=(status,result)=>({pair:'native',config:{id:'native'},kind:'paired',status,result});
  const rows=[make('pass',{pass:true,completedSteps:5,usage:{usd:2},billingComplete:true}),make('fail',{pass:false,completedSteps:1,usage:{usd:1},billingComplete:true,retries:2,regressions:3})];
  let g=summarizeComparisons(rows)['native/native/paired'];assert.equal(g.costPerAcceptedChange,.5);assert.equal(g.passed,1);assert.equal(g.retries,2);
  rows.push(make('incomplete',{incomplete:{reason:'timeout'},billingComplete:false,usage:{reportedUsd:.2}}));
  g=summarizeComparisons(rows)['native/native/paired'];assert.equal(g.usd,null);assert.equal(g.reportedUsd,3.2);assert.equal(g.incomplete,1);assert.equal(g.unnecessaryQuestions,null);
});

test('missing credentials retain every scheduled smoke and paired attempt as unmeasured',async()=>{
  const evidenceRoot=mkdtempSync(path.join(tmpdir(),'comparison-test-'));
  try{const out=await runComparisons({tasks:[{id:'ledger',fixture:'campaign-ledger',steps:[{}]}],models,root,fixturesDir:FIXTURES,evidenceRoot,maxUsd:1,available:false,invokeFactory:()=>{throw new Error('must not invoke');}});
    assert.equal(out.attempts.length,24);assert.ok(out.attempts.every(a=>a.status==='unmeasured'));
    assert.equal(out.remainingUsd,1);assert.ok(existsSync(path.join(evidenceRoot,'comparison.json')));
  }finally{rmSync(evidenceRoot,{recursive:true,force:true});}
});

test('focused comparison preserves both arms and all repetitions without invoking other pairs',async()=>{
  const evidenceRoot=mkdtempSync(path.join(tmpdir(),'comparison-focused-'));
  try{
    assert.deepEqual(comparisonPairs(models,{pair:'native'}).map(p=>p.id),['native']);
    assert.throws(()=>comparisonPairs(models,{pair:'unknown'}),/comparison pair/);
    assert.throws(()=>comparisonPairs(models,{pair:'native',prune:true}),/comparison pair/);
    const out=await runComparisons({tasks:[{id:'ledger',fixture:'campaign-ledger',steps:[{}]}],models,root,fixturesDir:FIXTURES,evidenceRoot,pair:'graph',available:false,invokeFactory:()=>{throw new Error('must not invoke');}});
    assert.equal(out.attempts.length,8);
    assert.ok(out.attempts.every(a=>a.pair==='graph'&&a.status==='unmeasured'));
    assert.equal(out.attempts.filter(a=>a.kind==='smoke').length,2);
    assert.equal(out.attempts.filter(a=>a.kind==='paired').length,6);
    assert.deepEqual([...new Set(out.attempts.map(a=>a.config.id))],['without-graph','with-graph']);
  }finally{rmSync(evidenceRoot,{recursive:true,force:true});}
});

test('CLI rejects incomplete or incompatible comparison selectors before scheduling',()=>{
  for(const args of [['--compare','--comparison'],['--compare','--comparison','--dry'],['--comparison','native','--dry'],['--compare','--prune','--comparison','native','--dry']]){
    assert.throws(()=>execFileSync(process.execPath,['evals/run.mjs',...args],{cwd:root,stdio:'pipe'}),error=>error.status===2&&/comparison/.test(error.stderr.toString()));
  }
});

test('graph reconciles shell edits with unchanged mtime, deleted symbols, rename and branch checkout',()=>{
  const s=stage(FIXTURES,'campaign-ledger');
  try{
    const cfg=loadConfig(s.work),file=path.join(s.work,'src/ledger.mjs');
    const before=ensure(cfg);const st=statSync(file);
    writeFileSync(file,readFileSync(file,'utf8').replaceAll('addCustomer','newCustomer'));utimesSync(file,st.atime,st.mtime);
    assert.equal(load(cfg),null,'advisory cache reads must reject stale source');
    const edited=ensure(cfg);assert.notEqual(edited.fingerprint,before.fingerprint);
    assert.ok(!edited.modules['src/ledger.mjs'].symbols.some(s=>s.name==='addCustomer'));
    renameSync(file,path.join(s.work,'src/moved.mjs'));
    const updated=refresh(cfg);assert.ok(!updated.skipped);
    assert.ok(ensure(cfg).modules['src/moved.mjs']);assert.ok(!ensure(cfg).modules['src/ledger.mjs']);
    execFileSync('git',['checkout','-b','other'],{cwd:s.work,stdio:'ignore'});
    execFileSync('git',['add','-A'],{cwd:s.work});execFileSync('git',['-c','commit.gpgsign=false','commit','-qm','rename'],{cwd:s.work});
    execFileSync('git',['checkout','-'],{cwd:s.work,stdio:'ignore'});
    assert.ok(ensure(cfg).modules['src/ledger.mjs']);assert.ok(!ensure(cfg).modules['src/moved.mjs']);
  }finally{s.cleanup();}
});

test('bounded rg retrieval uses source hits and rejects deleted-symbol golden entries',()=>{
  const fixture=path.join(FIXTURES,'graph-app');
  const cfg={layout:{root:fixture},graph:{include:['.'],exclude:[]}};
  const found=boundedSearch(cfg,'place_order');assert.ok(found.tokens<=1200);assert.ok(found.included.some(p=>p.module==='src/app/service.py'));
  assert.throws(()=>bench([{root:fixture,term:'deleted_symbol',answer:'src/app/service.py'}]),/golden symbol missing/);
});

test('comparison budget reserves unknown billing and never launches an extra paid call',async()=>{
  const evidenceRoot=mkdtempSync(path.join(tmpdir(),'comparison-budget-'));let calls=0;
  try{
    const out=await runComparisons({tasks:[{id:'ledger',fixture:'campaign-ledger',steps:[{}]}],models,root,fixturesDir:FIXTURES,evidenceRoot,maxUsd:.1,
      invokeFactory:()=>async args=>{calls++;assert.equal(args.budgetUsd,.1);return {usage:{}};},
      runCampaign:async({invoke})=>{const r=await invoke({budgetUsd:1.5});return {pass:false,billingComplete:false,usage:r.usage,phases:[]};}});
    assert.equal(calls,1);assert.equal(out.remainingUsd,0);
    assert.ok(out.attempts.slice(1).every(a=>a.status==='unmeasured'));
    assert.equal(out.attempts.length,24);
  }finally{rmSync(evidenceRoot,{recursive:true,force:true});}
});

test('successful calibration runs three pairs in alternating order and retains all outcomes',async()=>{
  const evidenceRoot=mkdtempSync(path.join(tmpdir(),'comparison-pairs-'));
  try{
    const out=await runComparisons({tasks:[{id:'ledger',fixture:'campaign-ledger',steps:[{}]}],models,root,fixturesDir:FIXTURES,evidenceRoot,maxUsd:1,
      invokeFactory:()=>async()=>({usage:{usd:.001}}),
      runCampaign:async({invoke})=>{await invoke({budgetUsd:.1});return {pass:true,completedSteps:1,billingComplete:true,usage:{usd:.001},phases:[{name:'model-plan'}]};}});
    assert.equal(out.attempts.length,24);assert.ok(out.attempts.every(a=>a.status==='pass'));
    assert.deepEqual(out.attempts.filter(a=>a.pair==='native'&&a.kind==='paired').map(a=>a.config.id),['native','harness','harness','native','native','harness']);
    assert.ok(out.calibrations.every(c=>c.successful&&c.projectedUsd>0));
    assert.ok(Math.abs(out.remainingUsd-.976)<1e-9);
  }finally{rmSync(evidenceRoot,{recursive:true,force:true});}
});


test('abandoned and started attempts remain incomplete with unknown billing',()=>{
  const g=summarizeComparisons([{pair:'graph',config:{id:'with'},kind:'paired',status:'started'},
    {pair:'graph',config:{id:'with'},kind:'paired',status:'abandoned'}])['graph/with/paired'];
  assert.equal(g.incomplete,2);assert.equal(g.usd,null);assert.equal(g.costPerAcceptedChange,null);
});


test('operator abandonment retains the complete schedule and launches no model calls',async()=>{
  const evidenceRoot=mkdtempSync(path.join(tmpdir(),'comparison-stop-'));
  try{const out=await runComparisons({tasks:[{id:'ledger',fixture:'campaign-ledger',steps:[{}]}],models,root,fixturesDir:FIXTURES,evidenceRoot,maxUsd:1,shouldStop:()=>true,invokeFactory:()=>{throw new Error('must not invoke');}});
    assert.equal(out.scheduledAttempts.length,24);assert.equal(out.attempts.length,24);assert.equal(out.pendingAttempts,0);
    assert.ok(out.attempts.every(a=>a.status==='unmeasured'&&a.reason==='operator_abandoned'));
  }finally{rmSync(evidenceRoot,{recursive:true,force:true});}
});


test('suite deadline stops further model calls and preserves scheduled unmeasured attempts',async()=>{
  const evidenceRoot=mkdtempSync(path.join(tmpdir(),'comparison-deadline-'));let clock=0,calls=0;
  try{const out=await runComparisons({tasks:[{id:'ledger',fixture:'campaign-ledger',steps:[{}]}],models,root,fixturesDir:FIXTURES,evidenceRoot,maxUsd:1,maxMinutes:1,now:()=>clock,
    invokeFactory:()=>async args=>{calls++;assert.equal(args.timeoutMs,60000);clock=60001;return {usage:{usd:.001}};},
    runCampaign:async({invoke})=>{await invoke({budgetUsd:.1,timeoutMs:240000});return {pass:true,billingComplete:true,completedSteps:1,usage:{usd:.001},phases:[{name:'model-plan'}]};}});
    assert.equal(calls,1);assert.equal(out.attempts.length,24);assert.ok(out.attempts.slice(1).every(a=>a.reason==='suite_time_exhausted'));
  }finally{rmSync(evidenceRoot,{recursive:true,force:true});}
});


test('pruning changes only automatic session inventory in the isolated lean arm',()=>{
  // a-baseline-measures-what-ships step 9: the payload the experiment prunes now lives in
  // lib/session.mjs, so the experiment reads and writes that module instead of the hook.
  const original=readFileSync('.aidlc/lib/session.mjs','utf8');
  const baseline=restoreSessionInventory(original);
  assert.equal(restoreSessionInventory(pruneSessionInventory(baseline)),baseline);
  const pairs=comparisonPairs(models,{prune:true});
  assert.equal(pairs.length,1);assert.equal(pairs[0].arms[0].model,pairs[0].arms[1].model);
  for(const config of pairs[0].arms){
    const s=stage(FIXTURES,'campaign-ledger',{product:true});
    try{
      isolateStage(s,root);configureComparison(s,config);
      const session=readFileSync(path.join(s.plugin,'.aidlc/lib/session.mjs'),'utf8');
      assert.equal(session,config.prune?pruneSessionInventory(baseline):baseline);
      assert.equal(readFileSync(path.join(s.plugin,'.aidlc/lib/graph.mjs'),'utf8'),readFileSync('.aidlc/lib/graph.mjs','utf8'));
      assert.ok(session.includes('ledger.report('));assert.ok(session.includes('currentLine(cfg)'));
      const banner=JSON.parse(execFileSync(process.execPath,[path.join(s.plugin,'.aidlc/bin/harness'),'hook','session-start'],{cwd:s.work,encoding:'utf8',input:JSON.stringify({cwd:s.work})})).hookSpecificOutput.additionalContext;
      assert.equal(/^budget:/m.test(banner),!config.prune);
      assert.match(banner,/contract:/);assert.match(banner,/^check:/m);assert.match(banner,/^ledger:/m);

    }finally{s.cleanup();}
  }
  assert.equal(readFileSync('.aidlc/lib/session.mjs','utf8'),original);
  assert.throws(()=>pruneSessionInventory('changed source'),/source drift/);
});


test('pruning schedules only the matched product pair and preserves missing attempts',async()=>{
  const evidenceRoot=mkdtempSync(path.join(tmpdir(),'pruning-schedule-'));
  try{
    const out=await runComparisons({tasks:[{id:'ledger',fixture:'campaign-ledger',steps:[{}]},{id:'service',fixture:'campaign-service',steps:[{}]}],models:{generator:'capable',evaluator:'strong'},root,fixturesDir:FIXTURES,evidenceRoot,prune:true,repetitions:1,maxUsd:8,available:false,invokeFactory:()=>{throw new Error('must not invoke');}});
    assert.equal(out.kind,'pruning-comparison');assert.equal(out.attempts.length,8);
    assert.deepEqual([...new Set(out.attempts.map(a=>a.config.id))],['baseline','lean']);
    assert.ok(out.attempts.every(a=>a.status==='unmeasured'));assert.equal(out.remainingUsd,8);
  }finally{rmSync(evidenceRoot,{recursive:true,force:true});}
});


test('ledger description accepts the retained correct zero-balance wording and rejects the old rule',()=>{
  assert.equal(ledgerDescriptionExplainsPaidRule("Returns `false` once the invoice's outstanding amount reaches zero (fully paid), regardless of\n how far past its `dueDate` that is."),true);
  assert.equal(ledgerDescriptionExplainsPaidRule('Fully paid invoices are never overdue.'),true);
  assert.equal(ledgerDescriptionExplainsPaidRule('Invoices are overdue regardless of payment.'),false);
  assert.equal(ledgerDescriptionExplainsPaidRule('Returns true once the outstanding amount reaches zero (fully paid).'),false);
});


test('a pruning arm can be rerun without paying to repeat its completed counterpart',()=>{
  const pairs=comparisonPairs(models,{prune:true,pruneArm:'lean'});
  assert.deepEqual(pairs[0].arms.map(a=>a.id),['lean']);
  assert.throws(()=>comparisonPairs(models,{prune:true,pruneArm:'unknown'}),/prune-arm/);
  assert.throws(()=>comparisonPairs(models,{pruneArm:'lean'}),/prune-arm/);
});


test('single-arm calibration budgets only its scheduled campaigns',async()=>{
  const evidenceRoot=mkdtempSync(path.join(tmpdir(),'pruning-arm-budget-'));
  try{
    const out=await runComparisons({tasks:[{id:'ledger',fixture:'campaign-ledger',steps:[{}]}],models,root,fixturesDir:FIXTURES,evidenceRoot,prune:true,pruneArm:'lean',repetitions:1,maxUsd:1,
      invokeFactory:()=>async()=>({usage:{usd:.001}}),
      runCampaign:async({invoke})=>{await invoke({budgetUsd:.1});return {pass:true,completedSteps:1,billingComplete:true,usage:{usd:.001},phases:[{name:'model-plan'}]};}});
    assert.equal(out.attempts.length,2);assert.ok(out.attempts.every(a=>a.config.id==='lean'&&a.status==='pass'));
    assert.equal(out.calibrations[0].projectedUsd,.004);
  }finally{rmSync(evidenceRoot,{recursive:true,force:true});}
});
