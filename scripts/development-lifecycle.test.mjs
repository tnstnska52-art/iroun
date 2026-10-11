import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {previousUnfinishedRun,runtimeResources} from './development-lifecycle.mjs';

const moduleUrl=new URL('./development-lifecycle.mjs',import.meta.url).href;
const records=(dir,name)=>{try{return readFileSync(join(dir,`${name}.jsonl`),'utf8').trim().split('\n').map(JSON.parse);}catch{return [];}};
async function waitFor(predicate,timeout=6000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}
  assert.fail('Timed out waiting for isolated lifecycle fixture');
}
function manager(name,dir,script,maxRetries=1,command=process.execPath){
  const config={name,logDir:dir,command,args:['-e',script],maxRetries,retryDelayMs:20,heartbeatMs:50,shutdownMs:500};
  const child=spawn(process.execPath,['--input-type=module','-e',`import {startDevelopmentService} from ${JSON.stringify(moduleUrl)};startDevelopmentService(${JSON.stringify(config)});`],{stdio:['ignore','pipe','pipe']});
  child.stdout.resume();child.stderr.resume();
  return child;
}
async function stop(child){
  if(child.exitCode!==null)return;
  const done=once(child,'exit');
  child.kill('SIGTERM');await done;
}

test('unfinished run records last observation, not an invented stop time/cause',()=>{
  const old=[{event:'manager-start',pid:10,at:'2026-10-10T19:30:00Z',resources:{bootId:'old'}},{event:'heartbeat',pid:10,at:'2026-10-10T20:03:00Z'}].map(JSON.stringify).join('\n');
  assert.deepEqual(previousUnfinishedRun(old+'\n{"partial'),{lastObservedAt:'2026-10-10T20:03:00Z',previousPid:10,previousBootId:'old',cause:'unknown-no-clean-exit'});
});
test('clean stop is not classified as an unexplained disappearance',()=>{
  assert.equal(previousUnfinishedRun([{event:'manager-start',pid:1},{event:'manager-exit',pid:1}].map(JSON.stringify).join('\n')),null);
});
test('resource metadata uses own cgroup and does not include environment secrets',()=>{
  const data=runtimeResources();
  assert.equal(typeof data.bootId,'string');
  assert.equal(typeof data.cgroup,'string');
  assert.equal('env' in data,false);
  assert.equal('command' in data,false);
});
test('one service crash/exhaustion leaves the sibling process running',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'iroun-lifecycle-'));
  const stable=manager('expo',dir,'setInterval(()=>{},100)');
  try{
    await waitFor(()=>records(dir,'expo').some(x=>x.event==='heartbeat'));
    const failed=manager('api',dir,'process.exit(1)');
    const [code]=await once(failed,'exit');
    assert.equal(code,1);
    assert.equal(records(dir,'api').filter(x=>x.event==='child-start').length,2);
    assert.ok(records(dir,'api').some(x=>x.event==='retry-exhausted'));
    assert.equal(stable.exitCode,null);
    const n=records(dir,'expo').length;
    await waitFor(()=>records(dir,'expo').length>n);
  }finally{await stop(stable);}
});
test('unexpected exit 0 is retried and final failure is explicit',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'iroun-lifecycle-'));
  const child=manager('api',dir,'process.exit(0)');
  const [code]=await once(child,'exit');
  assert.equal(code,1);
  assert.equal(records(dir,'api').filter(x=>x.event==='unexpected-child-exit').length,2);
});
test('spawn failure is bounded and preserves safe error code',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'iroun-lifecycle-'));
  const child=manager('api',dir,'',0,'/nonexistent-iroun-fixture-command');
  const [code]=await once(child,'exit');
  assert.equal(code,1);
  assert.ok(records(dir,'api').some(x=>x.event==='child-spawn-error'&&x.code==='ENOENT'));
});
test('intentional stop does not restart and persists signal/exits',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'iroun-lifecycle-'));
  const child=manager('api',dir,'setInterval(()=>{},100)');
  await waitFor(()=>records(dir,'api').some(x=>x.event==='heartbeat'));
  await stop(child);
  const log=records(dir,'api');
  assert.equal(log.filter(x=>x.event==='child-start').length,1);
  assert.ok(log.some(x=>x.event==='manager-signal'&&x.signal==='SIGTERM'));
  assert.ok(log.some(x=>x.event==='manager-exit'&&x.code===0));
});
test('port conflict persists category only, not potentially sensitive output',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'iroun-lifecycle-'));
  const child=manager('api',dir,'console.error("EADDRINUSE fake-sensitive-marker");process.exit(1)',0);
  await once(child,'exit');
  const text=readFileSync(join(dir,'api.jsonl'),'utf8');
  assert.ok(text.includes('port-conflict'));
  assert.ok(!text.includes('fake-sensitive-marker'));
});
