import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, symlinkSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stage, isolateStage, assertProductTree } from '../evals/lib/stage.mjs';
import { invokerArgs, claudeInvoker } from '../evals/lib/invoker.mjs';
import {tmpdir} from 'node:os';
import {verifyLedger} from '../evals/lib/assertions.mjs';
import {runProductCampaign,runProductCheck} from '../evals/lib/campaign.mjs';
import { ROOT } from './_paths.mjs';
const fixtures = path.join(ROOT, 'evals/fixtures');

test('product staging exposes only portable plugin files, and refuses a product tree with a symlink', () => {
  const s = isolateStage(stage(fixtures, 'campaign-ledger'), ROOT);
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

test('private ledger acceptance rejects no-op and seeded faulty products', ()=>{
  const s=isolateStage(stage(fixtures,'campaign-ledger'),ROOT);
  try {
    assert.equal(verifyLedger(s,0).pass,true);
    assert.throws(()=>verifyLedger(s,1));
    const file=path.join(s.work,'src/ledger.mjs');
    writeFileSync(file,readFileSync(file,'utf8')+`
export function outstandingBalance(id){return listInvoices(id).reduce((n,i)=>n+i.amountCents,0);}
export function isOverdue(id,today){if(!invoices.has(id))throw new Error('unknown invoice');return invoices.get(id).dueDate<today;}
`);
    assert.equal(verifyLedger(s,1).pass,true);
    writeFileSync(file,readFileSync(file,'utf8')+'\nisOverdue=()=>true;\n');
    assert.throws(()=>verifyLedger(s,1));
  }finally{s.cleanup();}
});

test('deterministic product campaign preserves failed no-op evidence and external approvals', async()=>{
  const s=isolateStage(stage(fixtures,'campaign-ledger'),ROOT),evidence=mkdtempSync(path.join(tmpdir(),'product-evidence-'));
  try {
    const task={id:'deterministic-no-op',product:'ledger',timeoutMs:1000,budgetUsd:1,steps:[{
      slug:'balance',request:'Add balance and overdue queries.',behaviours:['Expose balance and overdue queries.'],files:['src/ledger.mjs'],level:1}]};
    const out=await runProductCampaign({task,sandbox:s,harnessBin:path.join(ROOT,'.aidlc/bin/harness'),evidenceDir:evidence,
      evaluateProduct:(s,step)=>verifyLedger(s,step.level),invoke:async()=>{
        writeFileSync(path.join(s.work,'.aidlc/state/current-run-id'),'deterministic-test');
        return {sessionId:'deterministic-test-session',transcript:'Await approval.',exitCode:0,usage:{usd:0}};
      }});
    assert.equal(out.completedSteps,0);assert.ok(out.assertions.some(a=>!a.pass));
    assert.equal(out.approvals.length,2);assert.ok(out.approvals.every(a=>a.authority==='simulated-test-driver'));
    assert.ok(existsSync(path.join(evidence,'phases.json')));assert.ok(existsSync(path.join(evidence,'product/src/ledger.mjs')));
  }finally{s.cleanup();rmSync(evidence,{recursive:true,force:true});}
});

test('incomplete product calls retain evidence and never invent missing billing', async()=>{
  for(const reason of ['timeout','invocation_error']){
    const s=isolateStage(stage(fixtures,'campaign-service',{product:true}),ROOT),evidence=mkdtempSync(path.join(tmpdir(),'product-incomplete-'));
    try{
      const task={id:'deterministic-incomplete',product:'service',timeoutMs:1000,budgetUsd:1,steps:[{
        slug:'service-create',request:'Create the service.',behaviours:['Expose HTTP health.'],files:['src/server.mjs'],level:1}]};
      const out=await runProductCampaign({task,sandbox:s,harnessBin:path.join(ROOT,'.aidlc/bin/harness'),evidenceDir:evidence,
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

test('private HTTP acceptance exercises persistence, rule changes and storage failure outside the server', async()=>{
  const {verifyService}=await import('../evals/lib/assertions.mjs');
  const s=isolateStage(stage(fixtures,'campaign-service',{product:true}),ROOT);
  try {
    assert.equal(existsSync(path.join(s.work,'src/app')),false,'greenfield product has no unrelated Python source');
    assert.throws(()=>verifyService(s,1),'an empty product must fail acceptance');
    const server=`import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
      const file=process.env.DATA_FILE;let items=file&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
      const save=next=>{if(file){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(next));}items=next;};
      http.createServer(async(req,res)=>{
        const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
        if(req.method==='GET'&&req.url==='/health')return reply(200,{ok:true});
        if(req.method==='GET'&&req.url==='/items')return reply(200,items);
        if(req.method==='POST'&&req.url==='/items'||req.method==='PATCH'&&/^\\/items\\/\\d+$/.test(req.url)){
          let text='';for await(const part of req)text+=part;let data;try{data=JSON.parse(text);}catch{return reply(400,{error:'JSON'});}
          if(req.method==='POST'){
            if(typeof data.title!=='string'||!data.title.trim()||data.title.trim().length>LIMIT)return reply(400,{error:'title'});
            const item={id:Math.max(0,...items.map(i=>i.id))+1,title:data.title.trim(),done:false};
            try{save([...items,item]);return reply(201,item);}catch{return reply(503,{error:'storage'});}
          }
          if(typeof data.done!=='boolean')return reply(400,{error:'done'});
          const item=items.find(i=>i.id===Number(req.url.split('/')[2]));if(!item)return reply(404,{error:'missing'});
          const updated={...item,done:data.done};try{save(items.map(i=>i.id===item.id?updated:i));return reply(200,updated);}catch{return reply(503,{error:'storage'});}
        }return reply(404,{error:'route'});
      }).listen(Number(process.env.PORT));`;
    const {mkdirSync}=await import('node:fs');mkdirSync(path.join(s.work,'src'),{recursive:true});
    const file=path.join(s.work,'src/server.mjs');writeFileSync(file,server.replace('LIMIT','80'));
    assert.equal(verifyService(s,3).pass,true);
    writeFileSync(file,server.replace('LIMIT','40'));assert.equal(verifyService(s,6).pass,true);
    writeFileSync(file,"import http from 'node:http';http.createServer((q,r)=>{r.end(JSON.stringify({ok:true}));}).listen(Number(process.env.PORT));");
    assert.throws(()=>verifyService(s,1),'a service returning success for every request is not a product pass');
  }finally{s.cleanup();}
});

test('comparison campaigns grade both configurations and detect unapproved writes', async()=>{
  const {runComparisonCampaign}=await import('../evals/lib/campaign.mjs');
  for(const native of [true,false])for(const premature of [false,true]){
    const s=isolateStage(stage(fixtures,'campaign-ledger',{product:true,native}),ROOT);
    const evidence=mkdtempSync(path.join(tmpdir(),'comparison-proof-'));
    try{
      const task={id:'ledger',product:'ledger',budgetUsd:1,timeoutMs:1000,steps:[{slug:'queries',request:'Add balance and overdue queries',behaviours:['Add balance and overdue queries'],files:['src/ledger.mjs'],level:1}]};
      const out=await runComparisonCampaign({task,config:{id:native?'native':'harness'},sandbox:s,evidenceDir:evidence,evaluateProduct:(s,step)=>verifyLedger(s,step.level),
        invoke:async({phase})=>{
          if(!native)writeFileSync(path.join(s.work,'.aidlc/state/current-run-id'),'test');
          if(phase==='implement'||premature){const file=path.join(s.work,'src/ledger.mjs');writeFileSync(file,readFileSync(file,'utf8')+`\nexport function outstandingBalance(id){return listInvoices(id).reduce((n,i)=>n+i.amountCents,0);}\nexport function isOverdue(id,today){if(!invoices.has(id))throw new Error('unknown invoice');return invoices.get(id).dueDate<today;}\n`);}
          return {sessionId:'deterministic',transcript:'Should I proceed with this implementation?',exitCode:0,usage:{usd:0}};
        }});
      assert.equal(out.pass,!premature);assert.equal(out.approvalViolations,Number(premature));
      assert.equal(out.completedSteps,premature?0:1);assert.ok(existsSync(path.join(evidence,'phases.json')));
    }finally{s.cleanup();rmSync(evidence,{recursive:true,force:true});}
  }
});

test('unparseable independent comparison review is incomplete and does not request implementation repairs', async()=>{
  const {runComparisonCampaign}=await import('../evals/lib/campaign.mjs');
  const s=isolateStage(stage(fixtures,'campaign-ledger',{product:true,native:true}),ROOT);
  const evidence=mkdtempSync(path.join(tmpdir(),'comparison-review-'));let implementations=0;
  try{
    const task={id:'ledger',budgetUsd:1,timeoutMs:1000,steps:[{slug:'keep-api',request:'Preserve current behaviour',behaviours:['Keep API'],files:['src/ledger.mjs'],level:1}]};
    const out=await runComparisonCampaign({task,config:{id:'evaluated',evaluate:true},sandbox:s,evidenceDir:evidence,evaluateProduct:()=>({name:'preserved',pass:true}),invoke:async({phase,sandbox,sessionId})=>{
      if(phase==='implement')implementations++;
      if(phase==='review'){assert.notEqual(sandbox.work,s.work);assert.equal(sessionId,null);}
      return {sessionId:'test',exitCode:0,usage:{usd:0},transcript:phase==='review'?'not a review verdict':'Request approval.'};
    }});
    assert.equal(out.incomplete?.reason,'review_incomplete');assert.equal(implementations,1);assert.equal(out.retries,0);
  }finally{s.cleanup();rmSync(evidence,{recursive:true,force:true});}
});

test('comparison detects agent self-approval before the driver replaces its proposal', async()=>{
  const {runComparisonCampaign}=await import('../evals/lib/campaign.mjs');
  const s=isolateStage(stage(fixtures,'campaign-ledger',{product:true}),ROOT),evidence=mkdtempSync(path.join(tmpdir(),'comparison-forged-'));
  try{
    const task={id:'ledger',budgetUsd:1,timeoutMs:1000,steps:[{slug:'keep-api',request:'Preserve API',behaviours:['Preserve API'],files:['src/ledger.mjs'],level:1}]};
    const out=await runComparisonCampaign({task,config:{id:'harness'},sandbox:s,evidenceDir:evidence,evaluateProduct:()=>{throw new Error('must not reach acceptance');},invoke:async()=>{
      const f=path.join(s.work,'.aidlc/artifacts/keep-api/spec.md');writeFileSync(f,readFileSync(f,'utf8').replace('status: draft','status: approved'));
      return {sessionId:'test',exitCode:0,usage:{usd:0},transcript:'Approval recorded.'};
    }});
    assert.equal(out.pass,false);assert.equal(out.approvalViolations,1);assert.equal(out.decisions.length,0);
  }finally{s.cleanup();rmSync(evidence,{recursive:true,force:true});}
});

test('failed product tests with leaked servers return findings before the invocation deadline', ()=>{
  const s=isolateStage(stage(fixtures,'campaign-service',{product:true}),ROOT);
  try{
    writeFileSync(path.join(s.work,'tests/leaked-server.test.mjs'),"import test from 'node:test'; import assert from 'node:assert/strict'; import http from 'node:http'; test('failure before cleanup',()=>{http.createServer().listen(0);assert.fail('seeded failure');});\n");
    const out=runProductCheck(s,25000);
    assert.equal(out.error,undefined,'the outer invocation must not time out');
    assert.equal(out.status,1,'the failed test must remain a failure');
    assert.match(out.stdout,/FAIL\s+test/);
  }finally{s.cleanup();}
});

// Staging runs the product under test as a plain Node child process. Each stage gets its own
// directory and each run its own ephemeral port, claimed by binding port 0 and reading back what
// the OS assigned, never by picking a constant (the-tests-run-without-docker B1, B3).
test('staging returns its own work directory and a real ephemeral port', async () => {
  const { claimPort } = await import('../evals/lib/stage.mjs');
  const a = stage(fixtures, 'campaign-service', { product: true });
  const b = stage(fixtures, 'campaign-service', { product: true });
  try {
    assert.notEqual(a.work, b.work, 'two concurrent stages must not share a directory');
    const portA = claimPort(), portB = claimPort();
    assert.ok(Number.isInteger(portA) && portA > 0, 'a port claimed by binding port 0 must be a real port number');
    assert.ok(Number.isInteger(portB) && portB > 0);
    assert.notEqual(portA, portB, 'a port is read back from the OS, never picked as a constant');
  } finally { a.cleanup(); b.cleanup(); }
});

// B4: a run that times out must leave no live descendant — asserted, not assumed.
test('a run that times out leaves no live descendant process', async () => {
  const { execNode } = await import('../evals/lib/stage.mjs');
  // A direct child proves nothing here: spawnSync's own killSignal already reaps it, so this test
  // passed with killProcessGroup deleted. The group kill exists for the GRANDCHILD — the product's
  // `node --test` spawns a process per test file, and those are what outlive a killed parent. So
  // the child reports its grandchild's pid on stdout before hanging, and we check that one.
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

// B4 (the-harness-needs-no-container): there is no container path left to harden, so what is
// asserted is the refusal itself — a live product trial must not fall through to running a
// coding agent with Bash on the host. test/no-container.test.mjs owns the primary assertion;
// this one keeps it in the product-trial suite where the behaviour lives.
test('a live product trial refuses rather than running an agent on the host', () => {
  const s = isolateStage(stage(fixtures, 'campaign-ledger'), ROOT);
  try {
    const invoke = claudeInvoker({ pluginDir: '/plugin-dir' });
    assert.throws(() => invoke({ prompt: 'p', cwd: s.work, timeoutMs: 1000, budgetUsd: 1, task: {}, sandbox: s }),
      /no boundary to run in/);
  } finally { s.cleanup(); }
});

// What staging genuinely provides, stated as exactly that: the private grading file sits outside
// the tree handed to the child process. It is never described as isolation, and nothing here
// claims a boundary — a directory is not a sandbox and neither is a process.
test('staging keeps the private grading file outside the tree handed to the child process', () => {
  const s = isolateStage(stage(fixtures, 'campaign-ledger'), ROOT);
  try {
    const secret = path.join(s.root, 'private-grading.json');
    writeFileSync(secret, 'private');
    assert.ok(!secret.startsWith(s.work + path.sep) && secret !== s.work, 'the private grading file must sit outside s.work');
    assert.equal(existsSync(path.join(s.work, path.relative(s.root, secret))), false);
  } finally { s.cleanup(); }
});
