// Sequential paired experiments, using the existing isolated product campaign machinery.
import {mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {spawnSync,execFileSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {stage,isolateStage} from './stage.mjs';
import {runComparisonCampaign} from './campaign.mjs';
import {verifyLedger,verifyService} from './assertions.mjs';

export function comparisonPairs(models) {
  for(const key of ['generator','evaluator','evals'])if(!models?.[key])throw new Error(`comparison requires explicit ${key} model; no substitution`);
  return [
    {id:'native',arms:[{id:'native',native:true,model:models.generator},{id:'harness',model:models.generator}]},
    {id:'graph',arms:[{id:'without-graph',model:models.generator},{id:'with-graph',model:models.generator,graph:true}]},
    {id:'generation',arms:[{id:'strong',model:models.evaluator},{id:'economical-evaluated',model:models.evals,evaluate:true}]},
  ];
}

export function summarizeComparisons(attempts) {
  const groups={};
  for(const a of attempts){
    const key=`${a.pair}/${a.config.id}/${a.kind}`;
    const g=groups[key]??={attempts:0,passed:0,incomplete:0,unmeasured:0,acceptedChanges:0,regressions:0,approvalViolations:0,retries:0,reportedUsd:0,billingComplete:true,latencyMs:0,unnecessaryQuestions:null};
    g.attempts++;g.passed+=Number(!!a.result?.pass);g.incomplete+=Number(!!a.result?.incomplete);g.unmeasured+=Number(a.status==='unmeasured');
    g.acceptedChanges+=a.result?.completedSteps??0;g.regressions+=a.result?.regressions??0;g.approvalViolations+=a.result?.approvalViolations??0;g.retries+=a.result?.retries??0;
    g.reportedUsd+=a.result?.usage?.reportedUsd??a.result?.usage?.usd??0;
    g.billingComplete&&=!!a.result&&a.result.billingComplete!==false;g.latencyMs+=a.result?.latencyMs??0;
  }
  for(const g of Object.values(groups)){g.usd=g.billingComplete?g.reportedUsd:null;g.costPerAcceptedChange=g.billingComplete&&g.acceptedChanges?g.reportedUsd/g.acceptedChanges:null;}
  return groups;
}

export function configureComparison(s) {
  if(s.native)return;
  // Experimental isolation only. Both harness arms suppress automatic cached map assistance;
  // the graph arm receives fresh bounded packs in its prompt. No production flags/controls.
  const graphFile=path.join(s.plugin,'.aidlc/lib/graph.mjs');
  writeFileSync(graphFile,readFileSync(graphFile,'utf8').replace('export function load(cfg) {','export function load(cfg) { return null;').replace('export function ensure(cfg) {',"export function ensure(cfg) { return {modules:{},version:0};"));
  const refreshFile=path.join(s.plugin,'.aidlc/lib/refresh.mjs');
  writeFileSync(refreshFile,readFileSync(refreshFile,'utf8').replace('export function refresh(cfg, { force = false } = {}) {',"export function refresh(cfg, { force = false } = {}) { return {skipped:'comparison-controlled'};"));
  rmSync(path.join(s.work,'CODEBASE-MAP.md'),{force:true});
  for(const rel of ['.claude/CLAUDE.md']){const f=path.join(s.work,rel);if(existsSync(f))writeFileSync(f,readFileSync(f,'utf8').split('\n').filter(l=>!/graph|harness pack|CODEBASE-MAP/.test(l)).join('\n'));}
}

export async function gradeComparisonProduct(s,step,product) {
  const proof=product==='ledger'?verifyLedger(s,step.level):verifyService(s,step.level);
  if(product==='ledger'&&step.level===4&&!existsSync(path.join(s.work,'src/store.mjs')))throw new Error('storage extraction missing');
  if(product==='ledger'&&step.level===5){
    const doc=readFileSync(path.join(s.work,'docs/PRODUCT.md'),'utf8');
    if(!/partial|payment/i.test(doc)||!/paid[^\n]*(not|never)[^\n]*overdue|not overdue[^\n]*paid/i.test(doc))throw new Error('current product description misses payment/overdue rule');
    if(existsSync(path.join(s.work,'src/store.mjs')))throw new Error('external rename undone');
  }
  return proof;
}

export async function runComparisons({tasks,models,root,fixturesDir,evidenceRoot,maxUsd=40,repetitions=3,invokeFactory,available=true,log=()=>{},runCampaign=runComparisonCampaign,stageTrial=stage,isolate=isolateStage}) {
  if(!Number.isFinite(maxUsd)||maxUsd<=0)throw new Error('comparison budget must be finite and positive');
  if(!Number.isInteger(repetitions)||repetitions<1)throw new Error('repetitions must be a positive integer');
  const pairs=comparisonPairs(models);
  mkdirSync(evidenceRoot,{recursive:true});
  const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const out={kind:'native-comparisons',started:new Date().toISOString(),harnessRevision:revision,
    scenarioDigest:createHash('sha256').update(JSON.stringify(tasks)).digest('hex'),models,maxUsd,repetitions,attempts:[],calibrations:[],remainingUsd:maxUsd};
  const save=()=>{out.summary=summarizeComparisons(out.attempts);writeFileSync(path.join(evidenceRoot,'comparison.json'),JSON.stringify(out,null,2)+'\n');};
  let remaining=maxUsd;
  const bounded=invoke=>async args=>{
    if(remaining<=0)return {exitCode:1,incomplete:{reason:'comparison_budget_exhausted'},usage:{usd:0}};
    const allowance=Math.min(args.budgetUsd,remaining);let result;
    try{result=await invoke({...args,budgetUsd:allowance});}catch(error){remaining-=allowance;out.remainingUsd=remaining;save();throw error;}
    const cost=result.usage?.usd;
    remaining=Math.max(0,remaining-(Number.isFinite(cost)&&cost>=0?cost:allowance));out.remainingUsd=remaining;save();return result;
  };
  const attempt=async(pair,config,task,kind,repeat,reason=null)=>{
    const id=`${pair.id}-${config.id}-${kind}-${repeat}-${task.id}`;
    const row={id,pair:pair.id,config,task:task.id,kind,repeat,status:reason?'unmeasured':'started',reason,evidence:path.join(evidenceRoot,id)};
    out.attempts.push(row);save();if(reason)return row;
    let s;
    try{
      s=stageTrial(fixturesDir,task.fixture,{product:true,native:!!config.native});isolate(s,root);configureComparison(s);
      const invoke=bounded(invokeFactory(config));
      row.result=await runCampaign({task,config,invoke,sandbox:s,evidenceDir:row.evidence,evaluateProduct:(sandbox,step)=>gradeComparisonProduct(sandbox,step,task.product),log});
      row.status=row.result.incomplete?'incomplete':row.result.pass?'pass':'fail';
    }catch(error){row.status='incomplete';row.result={pass:false,billingComplete:false,incomplete:{reason:'driver_error',detail:error.message}};}
    finally{s?.cleanup();save();}return row;
  };
  for(const pair of pairs){
    const smoke=[];
    for(const config of pair.arms)for(const task of tasks)smoke.push(await attempt(pair,config,{...task,steps:task.steps.slice(0,1)},'smoke',0,!available?'credentials_or_isolation_unavailable':remaining<=0?'budget_exhausted':null));
    const successful=smoke.every(a=>a.result?.pass&&a.result.billingComplete);
    // First-change spend per phase, scaled by known campaign call counts, plus a 2x margin.
    const smokeCalls=smoke.flatMap(a=>a.result?.phases??[]).filter(p=>p.name?.startsWith('model-')).length;
    const smokeCost=smoke.reduce((n,a)=>n+(a.result?.usage?.usd??0),0);
    const calls=tasks.reduce((n,t)=>n+t.steps.reduce((m,s)=>m+2+Number(!!s.reject)+Number(!!s.stale)+Number(!!s.characterize)+2*Number(!!s.reviewSeed)+Number(pair.arms.some(c=>c.evaluate)),0),0);
    const projectedUsd=smokeCalls?2*smokeCost/smokeCalls*calls*2*repetitions:null;
    const reason=!available?'credentials_or_isolation_unavailable':!successful?'calibration_failed_or_unknown_billing':projectedUsd>remaining?'calibrated_suite_unaffordable':null;
    out.calibrations.push({pair:pair.id,successful,smokeCost,projectedUsd,remainingUsd:remaining,reason});save();
    for(let repeat=1;repeat<=repetitions;repeat++){
      // Alternate order within pairs to reduce systematic time/order bias.
      const arms=repeat%2?pair.arms:[...pair.arms].reverse();
      for(const config of arms)for(const task of tasks)await attempt(pair,config,task,'paired',repeat,reason??(remaining<=0?'budget_exhausted':null));
    }
  }
  out.finished=new Date().toISOString();save();return out;
}
