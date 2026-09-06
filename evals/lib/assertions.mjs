// The assertion engine. Pure over a staged context, so the whole grading half of the eval
// suite is unit-testable with no model in the loop — which is the only reason to trust a
// green suite at all.
//
// ctx = { work, pristine, transcript, harness, usage, baseline }

import { readFileSync, readdirSync, statSync, existsSync, rmSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productDockerArgs, runtimeSnapshot } from './stage.mjs';
import { unseenRequirements, behavioursHaveTests, modifiedNotReplaced, diffOwnedByCurrentChange, walk } from './campaign.mjs';

// A deliberately small glob: `*` inside one path segment. Enough for
// ".aidlc/artifacts/intent/*.md" and "tests/*.py", and small enough to have no bugs.
export function expand(root, pattern) {
  const parts = pattern.split('/');
  let dirs = [''];
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    const last = i === parts.length - 1;
    const next = [];
    for (const d of dirs) {
      const abs = path.join(root, d);
      if (!seg.includes('*')) {
        const p = path.join(d, seg);
        if (existsSync(path.join(root, p))) next.push(p);
        continue;
      }
      if (!existsSync(abs)) continue;
      const re = new RegExp('^' + seg.split('*').map(escapeRe).join('.*') + '$');
      for (const e of readdirSync(abs)) {
        if (!re.test(e)) continue;
        const p = path.join(d, e);
        if (last || statSync(path.join(root, p)).isDirectory()) next.push(p);
      }
    }
    dirs = next;
  }
  return dirs.filter(Boolean);
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Task authors reach for the inline flag `(?i)` because every other regex dialect has it.
// JavaScript does not, and an unsupported inline flag throws at construction — which the
// assertion engine would have recorded as a plain failure. Translating it here is cheaper
// than teaching everyone who writes a task that this one dialect is different.
export function toRegExp(pattern) {
  if (pattern instanceof RegExp) return pattern;
  const m = String(pattern).match(/^\(\?([ims]+)\)([\s\S]*)$/);
  return m ? new RegExp(m[2], m[1]) : new RegExp(String(pattern));
}

function diffTrees(a, b, scope = null) {
  const inScope = (f) => !scope || scope.some((s) => f === s || f.startsWith(s.replace(/\/$/, '') + '/'));
  const fa = walk(a).filter(inScope);
  const fb = walk(b).filter(inScope);
  const changed = [];
  for (const f of new Set([...fa, ...fb])) {
    const pa = path.join(a, f);
    const pb = path.join(b, f);
    if (!existsSync(pa) || !existsSync(pb)) { changed.push(f); continue; }
    if (readFileSync(pa).compare(readFileSync(pb)) !== 0) changed.push(f);
  }
  return changed.sort();
}

function runStage(ctx, stage) {
  const r = spawnSync('node', [ctx.harness, 'check', '--stage', stage], { cwd: ctx.work, encoding: 'utf8', timeout: 300000 });
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const ok = (pass, detail = '') => ({ pass, detail });

export const CHECKS = {
  fixture_tests_pass(ctx, want) {
    const r = runStage(ctx, 'stop');
    return ok(r.ok === want, r.ok ? '' : r.output.trim().split('\n').slice(0, 6).join(' | '));
  },
  harness_stage_passes(ctx, stage) {
    const r = runStage(ctx, stage);
    return ok(r.ok, r.ok ? '' : r.output.trim().split('\n').slice(0, 6).join(' | '));
  },
  files_unchanged(ctx, paths) {
    const changed = diffTrees(ctx.pristine, ctx.work, paths);
    return ok(changed.length === 0, changed.length ? `touched: ${changed.join(', ')}` : '');
  },
  workdir_unchanged(ctx, want) {
    const changed = diffTrees(ctx.pristine, ctx.work);
    return ok((changed.length === 0) === want, changed.length ? `touched: ${changed.slice(0, 8).join(', ')}` : '');
  },
  transcript_matches(ctx, re) {
    return ok(toRegExp(re).test(ctx.transcript), `no match for /${re}/`);
  },
  transcript_not_matches(ctx, re) {
    const m = ctx.transcript.match(toRegExp(re));
    return ok(!m, m ? `matched /${re}/ at "${m[0]}"` : '');
  },
  transcript_order(ctx, needles) {
    let at = 0;
    for (const n of needles) {
      const i = ctx.transcript.slice(at).search(toRegExp(n.startsWith('(?') ? n : `(?i)${n}`));
      if (i === -1) return ok(false, `"${n}" not found after position ${at}`);
      at += i + 1;
    }
    return ok(true);
  },
  file_exists(ctx, pattern) {
    const hits = expand(ctx.work, pattern);
    return ok(hits.length > 0, hits.length ? '' : `nothing matched ${pattern}`);
  },
  file_matches(ctx, [pattern, re]) {
    const hits = expand(ctx.work, pattern);
    if (!hits.length) return ok(false, `nothing matched ${pattern}`);
    const hit = hits.some((f) => toRegExp(re).test(readFileSync(path.join(ctx.work, f), 'utf8')));
    return ok(hit, hit ? '' : `no file matching ${pattern} contains /${re}/`);
  },
  file_not_matches(ctx, [pattern, re]) {
    const bad = expand(ctx.work, pattern).filter((f) => toRegExp(re).test(readFileSync(path.join(ctx.work, f), 'utf8')));
    return ok(bad.length === 0, bad.length ? `${bad.join(', ')} contains /${re}/` : '');
  },
  under_baseline(ctx, { metric, tolerance }) {
    const base = ctx.baseline?.[metric];
    if (base == null) return ok(true, `no baseline for ${metric} yet — recorded, not graded`);
    const actual = ctx.usage?.[metric];
    if (actual == null) return ok(false, `invoker reported no ${metric}`);
    return ok(actual <= base * tolerance, `${metric} ${actual} vs baseline ${base} x${tolerance}`);
  },
  // Campaign checks. Thin adapters over the pure functions in campaign.mjs — see there for why.
  unseen_requirements(ctx, needles) {
    const r = unseenRequirements(ctx.work, needles);
    return ok(r.ok, r.violations.join('; '));
  },
  behaviours_have_tests(ctx, want) {
    const r = behavioursHaveTests(ctx.work);
    // Distinguishes "nothing to check" (checked: 0) from "checked and clean" — a step that
    // expects artifacts to exist must fail when there are none, the same way an empty suite is
    // not a pass. `unverifiable` is surfaced here rather than dropped: it is the majority row
    // shape in this repository's own plans, and a check that reports neither what it found wrong
    // nor what it declined to check is a check nobody can act on.
    const parts = [];
    if (r.violations.length) parts.push(r.violations.join('; '));
    if (r.unverifiable.length) parts.push(`unverifiable (names evidence, not a test): ${r.unverifiable.join(', ')}`);
    if (r.checked === 0) parts.push('no approved behaviour found to check');
    return ok((r.ok && r.checked > 0) === want, parts.join(' | '));
  },
  modified_not_replaced(ctx, { file, markers }) {
    const r = modifiedNotReplaced(ctx.work, file, markers);
    return ok(r.ok, r.violations.join('; '));
  },
  // Every product file changed since the previous step is named by the current change's plan.
  // `ctx.previous` is the runner's snapshot before the step; a single-prompt task has none and
  // is compared with the fixture.
  diff_owned_by_current_change(ctx, want) {
    const r = diffOwnedByCurrentChange(ctx.work, ctx.previous ?? ctx.pristine);
    return ok(r.ok === want, [r.violations.join('; '), r.current ? `current: ${r.current}` : ''].filter(Boolean).join(' | '));
  },
};

export const KNOWN = Object.keys(CHECKS);

export function evaluate(ctx, assertions) {
  return assertions.map((a) => {
    const [name, arg] = Object.entries(a)[0];
    const fn = CHECKS[name];
    if (!fn) return { name, pass: false, detail: `unknown assertion "${name}"` };
    try { return { name, ...fn(ctx, arg) }; }
    catch (e) { return { name, pass: false, detail: `assertion threw: ${e.message}` }; }
  });
}

// Transport only runs beside untrusted product code; private expectations remain in this process.
// A product can return incorrect output, but cannot rewrite the parent's assertion functions.
export function ledgerCalls(s, calls) {
  const source=runtimeSnapshot(s);
  try {
  const bridge = `import * as api from './src/ledger.mjs';
    let input=''; for await(const part of process.stdin) input+=part;
    const refs={},results=[];
    for(const call of JSON.parse(input)) {
      try { const args=call.args.map(v=>v && typeof v==='object' && '$ref' in v ? refs[v.$ref] : v);
        const value=await api[call.fn](...args); if(call.as) refs[call.as]=value;
        results.push({ok:true,value:value===undefined?null:JSON.parse(JSON.stringify(value))});
      } catch(error){results.push({ok:false,error:error.message});}
    } console.log(JSON.stringify(results));`;
  const name=`harness-ledger-${randomUUID()}`;
  const r = spawnSync('docker', [...productDockerArgs(source,{name}), 'node', '--input-type=module', '-e', bridge], {
    input: JSON.stringify(calls), encoding: 'utf8', timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 1024*1024,
  });
  if(r.error||r.signal)spawnSync('docker',['rm','-f',name],{encoding:'utf8',timeout:10000});
  if (r.status !== 0) throw new Error(`ledger runtime failed: ${r.error?.message ?? r.stderr}`);
  return JSON.parse(r.stdout.trim());
  } finally {source.dispose();}
}

export function verifyLedger(s, level) {
  const calls = [
    {fn:'addInvoice',args:[999,100,'2000-01-01']},
    {fn:'addCustomer',args:['A'],as:'a'}, {fn:'addCustomer',args:['B'],as:'b'},
    {fn:'addInvoice',args:[{$ref:'a'},1000,'2000-01-01'],as:'old'},
    {fn:'addInvoice',args:[{$ref:'a'},400,'2999-01-01'],as:'future'},
    {fn:'addInvoice',args:[{$ref:'b'},700,'2000-01-01']},
    {fn:'listInvoices',args:[{$ref:'a'}]},
  ];
  if(level>=1) calls.push({fn:'outstandingBalance',args:[{$ref:'a'}]},
    {fn:'outstandingBalance',args:[{$ref:'b'}]}, {fn:'isOverdue',args:[{$ref:'old'},'2026-01-01']},
    {fn:'isOverdue',args:[{$ref:'future'},'2026-01-01']});
  if(level>=2) calls.push(
    {fn:'recordPayment',args:[{$ref:'old'},250]}, {fn:'outstandingBalance',args:[{$ref:'a'}]},
    {fn:'recordPayment',args:[{$ref:'old'},0]}, {fn:'recordPayment',args:[{$ref:'old'},-1]},
    {fn:'recordPayment',args:[{$ref:'old'},1.5]}, {fn:'recordPayment',args:[{$ref:'old'},751]},
    {fn:'outstandingBalance',args:[{$ref:'a'}]}, {fn:'recordPayment',args:[{$ref:'old'},750]},
    {fn:'outstandingBalance',args:[{$ref:'a'}]}, {fn:'isOverdue',args:[{$ref:'old'},'2026-01-01']},
    {fn:'listInvoices',args:[{$ref:'a'}]});
  if(level>=1)calls.push({fn:'outstandingBalance',args:[999999]},{fn:'isOverdue',args:[999999,'2026-01-01']},{fn:'isOverdue',args:[{$ref:'old'},'2000-01-01']});
  const r=ledgerCalls(s,calls);
  assert.equal(r.length,calls.length);
  assert.equal(r[0].ok,false); assert.match(r[0].error,/unknown customer/i);
  assert.equal(typeof r[1].value,'number'); assert.notEqual(r[1].value,r[2].value);
  assert.equal(r[6].value.length,2); assert.equal(r[6].value[0].amountCents,1000);
  if(level>=1){const extra=r.slice(-3);assert.equal(extra[0].value,0);assert.equal(extra[1].ok,false);assert.match(extra[1].error,/unknown invoice/i);assert.equal(extra[2].value,false);}
  if(level>=1) { assert.equal(r[7].value,1400); assert.equal(r[8].value,700); assert.equal(r[9].value,true); assert.equal(r[10].value,false); }
  if(level>=2) {
    assert.equal(r[11].ok,true); assert.equal(r[12].value,1150);
    for(const i of [13,14,15,16]) assert.equal(r[i].ok,false,`invalid payment case ${i}`);
    assert.equal(r[17].value,1150); assert.equal(r[18].ok,true); assert.equal(r[19].value,400);
    assert.equal(r[20].value,level<3); assert.equal(r[21].value[0].amountCents,1000);
  }
  return {name:`ledger-api-level-${level}`,pass:true,cases:calls.length};
}

export function serviceProcess(s, { dataFile='/data/items.json' }={}) {
  const name=`harness-service-${randomUUID()}`;
  let source;
  const start=()=> {
    source=runtimeSnapshot(s);
    const r=spawnSync('docker',[...productDockerArgs(source,{name,detached:true,env:{PORT:'3000',DATA_FILE:dataFile}}),'node','src/server.mjs'],{encoding:'utf8',timeout:30000});
    if(r.status!==0){source.dispose();throw new Error(`service start failed: ${r.stderr}`);}
  };
  const stop=()=>{spawnSync('docker',['rm','-f',name],{encoding:'utf8',timeout:15000});source?.dispose();};
  const request=(method,url,body,raw=false)=> {
    const bridge=`let data='';for await(const part of process.stdin)data+=part;
      const req=JSON.parse(data); let response;
      for(let n=0;n<30;n++){try{response=await fetch('http://127.0.0.1:3000'+req.url,{method:req.method,
        headers:{'Content-Type':'application/json'},...(req.body===undefined?{}:{body:req.raw?req.body:JSON.stringify(req.body)}),signal:AbortSignal.timeout(2000)});break;}
        catch(e){if(n===29)throw e;await new Promise(r=>setTimeout(r,100));}}
      const text=await response.text(); console.log(JSON.stringify({status:response.status,body:JSON.parse(text)}));`;
    const r=spawnSync('docker',['exec','-i',name,'node','--input-type=module','-e',bridge],{
      input:JSON.stringify({method,url,body,raw}),encoding:'utf8',timeout:15000,killSignal:'SIGKILL',maxBuffer:1024*1024});
    if(r.status!==0) throw new Error(`HTTP transport failed: ${r.error?.message ?? r.stderr}`);
    return JSON.parse(r.stdout);
  };
  start();
  return {request,stop,restart(){stop();start();}};
}

export function verifyService(s, level) {
  // Replay real data produced by the preceding version before starting independent fresh cases.
  const baseline=path.join(s.root,'service-v3-data');
  if(level>=4 && existsSync(baseline)) {
    for(const entry of readdirSync(s.data))rmSync(path.join(s.data,entry),{recursive:true,force:true});
    cpSync(baseline,s.data,{recursive:true});
    const previous=serviceProcess(s);
    try{const out=previous.request('GET','/items');assert.equal(out.status,200);
      assert.ok(out.body.some(item=>item.title==='x'.repeat(80)),'previously accepted 80-character title remains readable');
    }finally{previous.stop();}
  }
  // Each independent case set starts empty; restarts reuse its actual on-disk data.
  for(const entry of readdirSync(s.data)) rmSync(path.join(s.data,entry),{recursive:true,force:true});
  const server=serviceProcess(s); const ask=server.request; let cases=0;
  const status=(response,code)=>{cases++;assert.equal(response.status,code);return response.body;};
  try {
    assert.equal(status(ask('GET','/health'),200).ok,true);
    assert.deepEqual(status(ask('GET','/items'),200),[]);
    const item=status(ask('POST','/items',{title:'  First  '}),201);
    assert.equal(item.title,'First');assert.equal(item.done,false);assert.equal(typeof item.id,'number');
    assert.equal(status(ask('GET','/items'),200).length,1);
    if(level>=2){
      for(const title of ['', ' ', 42, 'x'.repeat((level>=4?40:80)+1)]) status(ask('POST','/items',{title}),400);
      status(ask('POST','/items',{title:'x'.repeat(level>=4?40:80)}),201);
      status(ask('POST','/items','{',true),400);status(ask('GET','/missing'),404);
      status(ask('PATCH',`/items/${item.id}`,{done:'yes'}),400);
      assert.equal(status(ask('PATCH',`/items/${item.id}`,{done:true}),200).done,true);
      status(ask('PATCH','/items/999999',{done:true}),404);
    }
    if(level>=3){
      server.restart(); const items=status(ask('GET','/items'),200);
      assert.equal(items.length,2);assert.equal(items[0].title,'First');assert.equal(items[0].done,true);
      const next=status(ask('POST','/items',{title:'Next'}),201);assert.ok(next.id>Math.max(...items.map(item=>item.id)));
    }
  } finally{server.stop();}
  if(level===3)cpSync(s.data,baseline,{recursive:true});
  if(level>=6){
    const failing=serviceProcess(s,{dataFile:'/unwritable/items.json'});
    try {status(failing.request('POST','/items',{title:'Lost'}),503);
      assert.deepEqual(status(failing.request('GET','/items'),200),[]);
      assert.equal(status(failing.request('GET','/health'),200).ok,true);
    } finally{failing.stop();}
  }
  return {name:`service-http-level-${level}`,pass:true,cases};
}
