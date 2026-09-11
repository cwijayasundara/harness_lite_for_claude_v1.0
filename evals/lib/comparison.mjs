// Sequential paired experiments, using the existing isolated product campaign machinery.
import {mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {spawnSync,execFileSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {stage,isolateStage} from './stage.mjs';
import {runComparisonCampaign,walk} from './campaign.mjs';
import {verifyLedger,verifyService,verifyReporting,ledgerDescriptionExplainsPaidRule} from './assertions.mjs';

export function comparisonPairs(models, {prune=false,pruneArm=null,pair=null}={}) {
  for(const key of (prune?['generator','evaluator']:['generator','evaluator','evals']))if(!models?.[key])throw new Error(`comparison requires explicit ${key} model; no substitution`);
  if(pruneArm && (!prune || !['baseline','lean'].includes(pruneArm)))throw new Error('prune-arm must be baseline or lean, with --prune');
  if(pair && (prune || !['native','graph','generation','retrieval'].includes(pair)))throw new Error('comparison pair must be native, graph, generation or retrieval, without --prune');
  if(prune)return [{id:'session-inventory',arms:[{id:'baseline',model:models.generator,prune:false},{id:'lean',model:models.generator,prune:true}].filter(arm=>!pruneArm||arm.id===pruneArm)}];
  // graph-first-versus-grep-first B1. The `graph` pair pastes a rendered pack into the prompt, so
  // it measures advisory packing, not retrieval. These arms differ in how the agent is told to
  // find code and in whether an index is there to query; neither is handed a pack. Reachable only
  // by name, so a default `--compare` run still runs exactly the pairs it ran before.
  if(pair==='retrieval')return [{id:'retrieval',arms:[
    {id:'grep-first',model:models.generator},
    {id:'graph-first',model:models.generator,graphFirst:true},
  ]}];
  return [
    {id:'native',arms:[{id:'native',native:true,model:models.generator},{id:'harness',model:models.generator}]},
    {id:'graph',arms:[{id:'without-graph',model:models.generator},{id:'with-graph',model:models.generator,graph:true}]},
    {id:'generation',arms:[{id:'strong',model:models.evaluator},{id:'economical-evaluated',model:models.evals,evaluate:true}]},
  ].filter(p=>!pair||p.id===pair);
}

export function summarizeComparisons(attempts) {
  const groups={};
  for(const a of attempts){
    const key=`${a.pair}/${a.config.id}/${a.kind}`;
    const g=groups[key]??={attempts:0,passed:0,incomplete:0,unmeasured:0,acceptedChanges:0,regressions:0,verificationFailures:0,approvalViolations:0,retries:0,reportedUsd:0,billingComplete:true,latencyMs:0,unnecessaryQuestions:null};
    g.attempts++;g.passed+=Number(!!a.result?.pass);g.incomplete+=Number(!!a.result?.incomplete||['started','incomplete','abandoned'].includes(a.status));g.unmeasured+=Number(a.status==='unmeasured');
    g.acceptedChanges+=a.result?.completedSteps??0;g.regressions=g.regressions===null||a.result?.regressions===null?null:g.regressions+(a.result?.regressions??0);g.verificationFailures+=a.result?.verificationFailures??0;g.approvalViolations+=a.result?.approvalViolations??0;g.retries+=a.result?.retries??0;
    g.reportedUsd+=a.result?.usage?.reportedUsd??a.result?.usage?.usd??0;
    g.billingComplete&&=!!a.result&&a.result.billingComplete!==false;g.latencyMs+=a.result?.latencyMs??0;
  }
  for(const g of Object.values(groups)){g.usd=g.billingComplete?g.reportedUsd:null;g.costPerAcceptedChange=g.billingComplete&&g.acceptedChanges?g.reportedUsd/g.acceptedChanges:null;}
  return groups;
}

// Exactly one experimental mechanism: automatic budget inventory at session start.
// Keep the ledger error warnings, approval context, graph and executable budget check.
export function pruneSessionInventory(source) {
  const lines=source.split('\n');
  const remove=["import { measure } from '../checks/", 'const m = measure(cfg);', '`budget: ${Object.entries(m)'];
  for(const marker of remove)if(lines.filter(l=>l.includes(marker)).length!==1)throw new Error(`session inventory experiment source drift: ${marker}`);
  return lines.filter(l=>!remove.some(marker=>l.includes(marker))).join('\n');
}

// Keep the experiment repeatable if the lean banner is retained in production. Restore only
// these three historical lines, never an old whole module that could undo later guard repairs.
//
// a-baseline-measures-what-ships step 9. The payload moved from `.aidlc/hooks/dispatch.mjs` to
// `.aidlc/lib/session.mjs`, so the anchors moved with it: the ledger import is now `./ledger.mjs`,
// there is no `ledger.newRun` to anchor on because run-id rotation stayed in the hook, and the
// body is indented two spaces rather than eight. Each anchor is the line the inserted line
// follows in the real source, so restore(prune(x)) still reproduces x byte for byte.
export function restoreSessionInventory(source) {
  if(source.includes('const m = measure(cfg);')){pruneSessionInventory(source);return source;}
  const insertions=[
    ["import { fileURLToPath } from 'node:url';", "import { measure } from '../checks/budget.mjs';"],
    ['export function sessionContext(cfg) {', '  const m = measure(cfg);'],
    ['    `check:  ${invocation(cfg)} check --stage fast --changed`,', '    `budget: ${Object.entries(m).map(([k, v]) => `${k} ${v}/${cfg.limits[k] ?? \'-\'}`).join(\' · \')}`,'],
  ];
  for(const [anchor,line] of insertions){
    if(source.split(anchor).length!==2)throw new Error(`session inventory experiment source drift: ${anchor}`);
    source=source.replace(anchor,`${anchor}\n${line}`);
  }
  pruneSessionInventory(source);return source;
}

export function configureComparison(s, config={}) {
  if(config.prune!==undefined){
    const file=path.join(s.plugin,'.aidlc/lib/session.mjs');
    const baseline=restoreSessionInventory(readFileSync(file,'utf8'));
    writeFileSync(file,config.prune?pruneSessionInventory(baseline):baseline);
    return;
  }
  if(s.native)return;
  // graph-first-versus-grep-first B1. The graph-first arm is told to query the index, so it must
  // have one. Every other harness arm keeps the suppression it has today, grep-first included —
  // that arm is the control, and it is the same configuration `without-graph` has always run.
  if(config.graphFirst)return;
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
  if(product==='reporting')return verifyReporting(s,step.level);
  const proof=product==='ledger'?verifyLedger(s,step.level):verifyService(s,step.level);
  if(product==='ledger'&&step.level===4&&!existsSync(path.join(s.work,'src/store.mjs')))throw new Error('storage extraction missing');
  if(product==='ledger'&&step.level===5){
    const doc=readFileSync(path.join(s.work,'docs/PRODUCT.md'),'utf8');
    if(!/partial|payment/i.test(doc)||!ledgerDescriptionExplainsPaidRule(doc))throw new Error('current product description misses payment/overdue rule');
    if(existsSync(path.join(s.work,'src/store.mjs')))throw new Error('external rename undone');
  }
  return proof;
}

export async function runComparisons({tasks,models,root,fixturesDir,evidenceRoot,maxUsd=40,maxMinutes=30,prune=false,pruneArm=null,pair=null,now=Date.now,repetitions=3,invokeFactory,available=true,shouldStop=()=>false,log=()=>{},runCampaign=runComparisonCampaign,stageTrial=stage,isolate=isolateStage}) {
  if(!Number.isFinite(maxUsd)||maxUsd<=0)throw new Error('comparison budget must be finite and positive');
  if(!Number.isFinite(maxMinutes)||maxMinutes<=0)throw new Error('comparison time limit must be finite and positive');
  const deadline=now()+maxMinutes*60000;
  if(!Number.isInteger(repetitions)||repetitions<1)throw new Error('repetitions must be a positive integer');
  mkdirSync(evidenceRoot,{recursive:true});
  let pairs;
  try{pairs=comparisonPairs(models,{prune,pruneArm,pair});}catch(error){writeFileSync(path.join(evidenceRoot,'comparison.json'),JSON.stringify({kind:prune?'pruning-comparison':'native-comparisons',status:'unmeasured',reason:error.message.startsWith('prune-arm')?'invalid_prune_arm':error.message.startsWith('comparison pair')?'invalid_comparison_pair':'models_unconfigured',detail:error.message,models,attempts:[]},null,2)+'\n');throw error;}
  const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const out={kind:prune?'pruning-comparison':'native-comparisons',started:new Date().toISOString(),harnessRevision:revision,
    tools:{node:process.version,git:spawnSync('git',['--version'],{encoding:'utf8'}).stdout?.trim()??null},
    scenarioDigest:createHash('sha256').update(JSON.stringify(tasks)).digest('hex'),models,maxUsd,maxMinutes,repetitions,attempts:[],calibrations:[],remainingUsd:maxUsd};
  out.scheduledAttempts=pairs.flatMap(pair=>[0,...Array.from({length:repetitions},(_,i)=>i+1)].flatMap(repeat=>pair.arms.flatMap(config=>tasks.map(task=>`${pair.id}-${config.id}-${repeat?'paired':'smoke'}-${repeat}-${task.id}`))));
  const unavailable=()=>shouldStop()?'operator_abandoned':now()>=deadline?'suite_time_exhausted':!available?'credentials_or_isolation_unavailable':remaining<=0?'budget_exhausted':null;
  const save=()=>{out.summary=summarizeComparisons(out.attempts);out.pendingAttempts=out.scheduledAttempts.length-out.attempts.length;out.economics=summarizeComparisons(out.attempts.map(a=>({...a,kind:'all'})));writeFileSync(path.join(evidenceRoot,'comparison.json'),JSON.stringify(out,null,2)+'\n');};
  let remaining=maxUsd;
  const bounded=invoke=>async args=>{
    if(shouldStop())return {exitCode:1,incomplete:{reason:'operator_abandoned'},usage:{usd:0}};
    if(now()>=deadline)return {exitCode:1,incomplete:{reason:'suite_time_exhausted'},usage:{usd:0}};
    if(remaining<=0)return {exitCode:1,incomplete:{reason:'comparison_budget_exhausted'},usage:{usd:0}};
    const allowance=Math.min(args.budgetUsd,remaining);let result;
    try{result=await invoke({...args,budgetUsd:allowance,timeoutMs:Math.min(args.timeoutMs??240000,Math.max(1,deadline-now()))});}catch(error){remaining-=allowance;out.remainingUsd=remaining;save();throw error;}
    const cost=result.usage?.usd;
    remaining=Math.max(0,remaining-(Number.isFinite(cost)&&cost>=0?cost:allowance));out.remainingUsd=remaining;save();return result;
  };
  const attempt=async(pair,config,task,kind,repeat,reason=null)=>{
    const id=`${pair.id}-${config.id}-${kind}-${repeat}-${task.id}`;
    const fixtureRoot=path.join(fixturesDir,task.fixture);
    const fixtureDigest=createHash('sha256').update(JSON.stringify(walk(fixtureRoot).map(f=>[f,createHash('sha256').update(readFileSync(path.join(fixtureRoot,f))).digest('hex')]))).digest('hex');
    const row={id,fixtureDigest,pair:pair.id,config,task:task.id,kind,repeat,status:reason?'unmeasured':'started',reason,evidence:path.join(evidenceRoot,id)};
    out.attempts.push(row);save();if(reason)return row;
    let s;
    try{
      s=stageTrial(fixturesDir,task.fixture,{product:true,native:!!config.native});isolate(s,root);configureComparison(s,config);
      row.pluginDigest=s.native?null:createHash('sha256').update(JSON.stringify(walk(s.plugin).map(f=>[f,createHash('sha256').update(readFileSync(path.join(s.plugin,f))).digest('hex')]))).digest('hex');
      const invoke=bounded(invokeFactory(config));
      row.result=await runCampaign({task,config,invoke,sandbox:s,evidenceDir:row.evidence,evaluateProduct:(sandbox,step)=>gradeComparisonProduct(sandbox,step,task.product),log});
      row.status=row.result.incomplete?'incomplete':row.result.pass?'pass':'fail';
    }catch(error){row.status='incomplete';row.result={pass:false,billingComplete:false,incomplete:{reason:'driver_error',detail:error.message}};}
    finally{s?.cleanup();save();}return row;
  };
  for(const pair of pairs){
    const smoke=[];
    for(const config of pair.arms)for(const task of tasks)smoke.push(await attempt(pair,config,{...task,steps:task.steps.slice(0,1)},'smoke',0,unavailable()));
    const successful=smoke.every(a=>a.result?.pass&&a.result.billingComplete);
    // First-change spend per phase, scaled by known campaign call counts, plus a 2x margin.
    const smokeCalls=smoke.flatMap(a=>a.result?.phases??[]).filter(p=>p.name?.startsWith('model-')).length;
    const smokeCost=smoke.reduce((n,a)=>n+(a.result?.usage?.usd??0),0);
    const calls=tasks.reduce((n,t)=>n+t.steps.reduce((m,s)=>m+2+Number(!!s.reject)+Number(!!s.stale)+Number(!!s.characterize)+2*Number(!!s.reviewSeed)+Number(pair.arms.some(c=>c.evaluate)),0),0);
    const projectedUsd=smokeCalls?2*smokeCost/smokeCalls*calls*pair.arms.length*repetitions:null;
    const reason=unavailable()??(!successful?'calibration_failed_or_unknown_billing':projectedUsd>remaining?'calibrated_suite_unaffordable':null);
    out.calibrations.push({pair:pair.id,successful,smokeCost,projectedUsd,remainingUsd:remaining,reason});save();
    for(let repeat=1;repeat<=repetitions;repeat++){
      // Alternate order within pairs to reduce systematic time/order bias.
      const arms=repeat%2?pair.arms:[...pair.arms].reverse();
      for(const config of arms)for(const task of tasks)await attempt(pair,config,task,'paired',repeat,unavailable()??reason);
    }
  }
  out.finished=new Date().toISOString();save();return out;
}
