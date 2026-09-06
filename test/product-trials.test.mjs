import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, symlinkSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stage, isolateStage, productDockerArgs, assertProductTree } from '../evals/lib/stage.mjs';
import { invokerArgs } from '../evals/lib/invoker.mjs';
import {tmpdir} from 'node:os';
import {verifyLedger} from '../evals/lib/assertions.mjs';
import {runProductCampaign} from '../evals/lib/campaign.mjs';
import { ROOT } from './_paths.mjs';
const fixtures = path.join(ROOT, 'evals/fixtures');

test('product staging exposes only portable plugin files and uses separate phase mounts', () => {
  const s = isolateStage(stage(fixtures, 'campaign-ledger'), ROOT);
  try {
    for (const rel of ['evals', '.env', '.git', '.aidlc/artifacts', '.aidlc/evals']) assert.equal(existsSync(path.join(s.plugin, rel)), false, rel);
    assert.ok(existsSync(path.join(s.plugin, '.claude-plugin/plugin.json')));
    const plan = productDockerArgs(s, { phase: 'plan' });
    assert.ok(plan.includes(`type=bind,src=${s.work},dst=/work,readonly`));
    const impl = productDockerArgs(s, { phase: 'implement' });
    assert.ok(impl.includes(`type=bind,src=${s.work}/.aidlc/artifacts,dst=/work/.aidlc/artifacts,readonly`));
    assert.ok(impl.includes(`type=bind,src=${s.work}/.git,dst=/work/.git,readonly`));
    assert.ok(!impl.some(s => s.includes('docker.sock')));
    const args = invokerArgs({product: true, model: 'configured-capable-model', prompt: 'p', budgetUsd: 1, sessionId: 'session'});
    assert.ok(!args.includes('--dangerously-skip-permissions'));
    assert.ok(!args[args.indexOf('--tools') + 1].includes('Bash'));
    assert.equal(args[args.indexOf('--resume') + 1], 'session');
    symlinkSync('/etc/passwd', path.join(s.work, 'escape'));
    assert.throws(() => assertProductTree(s.work), /symlink/);
  } finally { s.cleanup(); }
});

test('real container denies private reads and writes across planning and implementation boundaries', { skip: process.env.HARNESS_PRODUCT_DOCKER !== '1' }, () => {
  const s = isolateStage(stage(fixtures, 'campaign-ledger'), ROOT);
  try {
    const privateFile = path.join(s.root, 'private-assertions.json');
    writeFileSync(privateFile, 'private grading sentinel');
    writeFileSync(path.join(s.work, '.aidlc/artifacts/probe.md'), 'approved sentinel');
    for (const phase of ['plan', 'implement']) {
      const script = `const fs=require('fs'),assert=require('assert/strict');
        require('child_process').execFileSync('git',['rev-parse','HEAD']);
        for(const file of ${JSON.stringify([privateFile, path.join(ROOT,'evals/products.json'), '/plugin/evals/tasks.json','/var/run/docker.sock'])}) assert.throws(()=>fs.readFileSync(file));
        assert.throws(()=>fs.writeFileSync('/plugin/.claude-plugin/plugin.json','tamper'));
        assert.throws(()=>fs.writeFileSync('/work/.git/config','tamper'));
        assert.throws(()=>fs.writeFileSync('/work/.aidlc/harness.toml','tamper'));
        ${phase === 'plan' ? "assert.throws(()=>fs.writeFileSync('/work/src/ledger.mjs','tamper')); fs.writeFileSync('/work/.aidlc/artifacts/draft.md','draft');" : "assert.throws(()=>fs.writeFileSync('/work/.aidlc/artifacts/probe.md','tamper')); fs.writeFileSync('/work/src/owned.mjs','export const x=1;');"}
        console.log('boundary passed');`;
      const r = spawnSync('docker', [...productDockerArgs(s, { phase }), 'node', '-e', script], {encoding:'utf8',timeout:30000});
      assert.equal(r.status, 0, r.stderr+r.stdout);
      assert.match(r.stdout, /boundary passed/);
    }
    assert.equal(readFileSync(privateFile,'utf8'), 'private grading sentinel');
  } finally {s.cleanup();}
});


test('private ledger acceptance rejects no-op and seeded faulty products', {skip:process.env.HARNESS_PRODUCT_DOCKER!=='1'},()=>{
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

test('deterministic product campaign preserves failed no-op evidence and external approvals', {skip:process.env.HARNESS_PRODUCT_DOCKER!=='1'},async()=>{
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
