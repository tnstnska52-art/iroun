import {spawn} from 'node:child_process';
import {appendFileSync,mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

const read=(path)=>{try{return readFileSync(path,'utf8').trim();}catch{return null;}};
const counters=(text)=>text?Object.fromEntries(text.split('\n').map(line=>line.trim().split(/\s+/)).filter(parts=>parts.length===2).map(([key,value])=>[key,Number(value)])):null;

// Read this manager's cgroup, not the diagnostic shell's independent scope.
export function runtimeResources(){
  const cgroup=read('/proc/self/cgroup')?.split('\n').find(line=>line.startsWith('0::'))?.slice(3);
  const base=cgroup?join('/sys/fs/cgroup',cgroup):null;
  return {
    bootId:read('/proc/sys/kernel/random/boot_id'),
    cgroup,
    memoryEvents:base?counters(read(join(base,'memory.events'))):null,
    memoryCurrent:base?read(join(base,'memory.current')):null,
    memoryPeak:base?read(join(base,'memory.peak')):null,
    memoryMax:base?read(join(base,'memory.max')):null,
    cpu:base?counters(read(join(base,'cpu.stat'))):null,
    pidEvents:base?counters(read(join(base,'pids.events'))):null,
  };
}

export function previousUnfinishedRun(text){
  let last=null,start=null,ended=false;
  for(const line of text?.split('\n')??[]){
    try{
      const event=JSON.parse(line);
      if(event.event==='manager-start'){start=event;ended=false;}
      if(start&&event.pid===start.pid){
        last=event;
        if(event.event==='manager-exit')ended=true;
      }
    }catch{/* Ignore only incomplete crash-tail lines. */}
  }
  return start&&!ended?{lastObservedAt:last?.at??start.at,previousPid:start.pid,previousBootId:start.resources?.bootId??null,cause:'unknown-no-clean-exit'}:null;
}

export function startDevelopmentService({
  name,logDir,command,args=[],cwd,
  maxRetries=3,retryDelayMs=5000,heartbeatMs=60000,shutdownMs=5000,
}){
  mkdirSync(logDir,{recursive:true});
  const logFile=join(logDir,`${name}.jsonl`);
  const unfinished=previousUnfinishedRun(read(logFile));
  const record=(event,data={})=>{
    try{appendFileSync(logFile,JSON.stringify({at:new Date().toISOString(),event,pid:process.pid,...data})+'\n');}
    catch(error){process.stderr.write(`[${name}] lifecycle-record-failed ${error.code??'unknown'}\n`);}
  };
  let child,stopping=false,attempt=0,retryTimer,stopTimer;
  const diagnosticTypes=new Set();
  record('manager-start',{resources:runtimeResources()});
  if(unfinished)record('previous-run-unfinished',unfinished);
  const heartbeat=setInterval(()=>record('heartbeat',{
    childPid:child?.pid,uptimeSeconds:Math.floor(process.uptime()),resources:runtimeResources(),
  }),heartbeatMs);
  const handlers=new Map();
  const detach=()=>{
    clearInterval(heartbeat);clearTimeout(retryTimer);clearTimeout(stopTimer);
    for(const [signal,handler] of handlers)process.removeListener(signal,handler);
  };
  const exitHandler=code=>record('manager-exit',{code,resources:runtimeResources()});
  process.once('exit',exitHandler);
  function finish(code){
    detach();
    process.exitCode=code;
  }
  function launch(){
    record('child-start',{attempt});
    let spawnError=false;
    child=spawn(command,args,{cwd,stdio:['inherit','pipe','pipe'],env:process.env,detached:true});
    const copy=(stream,output)=>{
      stream?.on('data',chunk=>{
        output.write(chunk);
        // Persist only allowlisted error categories, never command/env/output contents.
        const text=String(chunk);
        for(const [type,pattern] of [
          ['port-conflict',/EADDRINUSE|Port \d+ is (?:being used|running this app)|Use port \d+ instead/],
          ['out-of-memory',/ENOMEM|heap out of memory|out of memory/i],
          ['permission-denied',/EACCES/],
          ['missing-module',/MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/],
          ['uncaught-exception',/uncaughtException|uncaught exception/i],
        ])if(pattern.test(text)&&!diagnosticTypes.has(type)){
          diagnosticTypes.add(type);record('child-diagnostic',{type});
        }
      });
    };
    copy(child.stdout,process.stdout);copy(child.stderr,process.stderr);
    child.once('error',error=>{
      spawnError=true;
      record('child-spawn-error',{code:error.code??'unknown'});
    });
    child.once('close',(code,signal)=>{
      record('child-exit',{code,signal,spawnError,resources:runtimeResources()});
      if(stopping){finish(0);return;}
      record('unexpected-child-exit',{code,signal});
      // Even exit 0 is unexpected for a long-running dev server.
      if(attempt<maxRetries){
        attempt++;
        retryTimer=setTimeout(launch,Math.min(30000,attempt*retryDelayMs));
      }else{
        record('retry-exhausted',{attempt});
        process.stderr.write(`[${name}] development service stopped after ${attempt} retries; inspect lifecycle records and workflow output.\n`);
        finish(1);
      }
    });
  }
  for(const signal of ['SIGTERM','SIGINT','SIGHUP']){
    const handler=()=>{
      if(stopping)return;
      stopping=true;
      record('manager-signal',{signal,resources:runtimeResources()});
      clearInterval(heartbeat);clearTimeout(retryTimer);
      if(child?.pid)try{process.kill(-child.pid,signal);}catch{}
      stopTimer=setTimeout(()=>{
        if(child?.pid)try{process.kill(-child.pid,'SIGKILL');}catch{}
        record('shutdown-timeout');
        finish(0);
      },shutdownMs);
      stopTimer.unref();
    };
    handlers.set(signal,handler);process.once(signal,handler);
  }
  launch();
}
