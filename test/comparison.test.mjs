import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdtempSync,rmSync,renameSync,utimesSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {comparisonPairs,summarizeComparisons,configureComparison,runComparisons} from '../evals/lib/comparison.mjs';
import {stage,isolateStage,productDockerArgs,FIXTURES} from '../evals/lib/stage.mjs';
import {invokerArgs} from '../evals/lib/invoker.mjs';
import {loadConfig} from '../.aidlc/lib/config.mjs';
import {ensure} from '../.aidlc/lib/graph.mjs';
import {refresh} from '../.aidlc/lib/refresh.mjs';
import {boundedSearch,bench} from '../evals/bench/pack-bench.mjs';
const root=path.resolve('.');
const models={generator:'capable',evaluator:'strong',evals:'economical'};

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
    const mounts=productDockerArgs(s,{phase:'implement'}).join(' ');
    assert.ok(!mounts.includes('dst=/plugin'));assert.ok(mounts.includes('dst=/work/.git,readonly'));
    const args=invokerArgs({product:true,native:true,comparison:true,model:'capable',budgetUsd:1});
    assert.ok(!args.includes('--plugin-dir'));assert.ok(args.includes('Bash(rg *)'));assert.ok(args.includes('Bash(node --test*)'));
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

test('graph reconciles shell edits with unchanged mtime, deleted symbols, rename and branch checkout',()=>{
  const s=stage(FIXTURES,'campaign-ledger');
  try{
    const cfg=loadConfig(s.work),file=path.join(s.work,'src/ledger.mjs');
    const before=ensure(cfg);const st=statSync(file);
    writeFileSync(file,readFileSync(file,'utf8').replaceAll('addCustomer','newCustomer'));utimesSync(file,st.atime,st.mtime);
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
