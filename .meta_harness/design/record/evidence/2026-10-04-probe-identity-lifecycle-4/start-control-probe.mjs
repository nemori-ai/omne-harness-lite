// Exploratory startup-control projection, not the product loader.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {coordinator,deferred} from './lifetime-prototype.mjs';
const require=createRequire(path.resolve('packages/core/kernel-basis/package.json'));
const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
function start(ctx, rows){
 const ready=deferred(),closed=deferred(),co=coordinator(rows.map(r=>r.id)),handles=[];
 let finishing=false,settled=false,returned=false;
 const fail=code=>{if(!settled){settled=true;ready.reject(new Error(code));}void finish();};
 void ready.promise.catch(()=>{});
 async function finish(){
  if(finishing)return;finishing=true;const report=await co.close();
  for(const handle of [...handles].reverse())await handle.dispose();
  closed.resolve(report);
 }
 const handle={ready:ready.promise,closed:closed.promise,dispose(){fail('stopped');return closed.promise;}};
 queueMicrotask(async()=>{
  try{
   for(let i=0;i<rows.length;i++){
    if(co.stopping)break;
    const row=rows[i],port=co.port(i);
    const fiber=ctx.plugin({name:row.id,apply(inner){
     assert.equal(returned,true);
     const setup=deferred();
     const receipt=port.register({ready:setup.promise,close:row.close});
     // Observe setup independently: Cordis failure cleanup can itself wait for resources.
     void setup.promise.catch(()=>fail('apply-failed:'+row.id));
     inner.effect(()=>async()=>{receipt.requestStop();await receipt.closed;});
     Promise.resolve().then(row.setup).then(setup.resolve,setup.reject);
     return setup.promise;
    }});
    handles.push(fiber);await fiber;
    if(co.stopping)break;
   }
   if(!settled){if(co.stopping)fail('stopped');else{settled=true;ready.resolve();}}
  }catch{fail('apply-failed');}
 });
 returned=true;return handle;
}
{
 const ctx=new Context();ctx.on('logger/message',()=>{});
 const releaseA=deferred(),startedB=deferred();const events=[];
 const handle=start(ctx,[
  {id:'a',async setup(){events.push('a-ready');},async close(){events.push('a-close-start');await releaseA.promise;throw new Error('a-close');}},
  {id:'b',async setup(){startedB.resolve();throw new Error('b-setup');},async close(){events.push('b-close');}},
  {id:'c',async setup(){events.push('c-should-not-start');},async close(){}}
 ]);
 assert.deepEqual(events,[]);let closed=false;handle.closed.then(()=>{closed=true;});
 await startedB.promise;await assert.rejects(handle.ready,/apply-failed:b/);
 await new Promise(r=>setTimeout(r,0));assert.equal(closed,false);assert.equal(events.includes('c-should-not-start'),false);
 const p=handle.dispose();assert.equal(p,handle.closed);releaseA.resolve();const report=await p;
 assert.equal(report.complete,false);assert.deepEqual(report.rows.map(r=>[r.id,r.errors]),[['b',['setup']],['a',['close']]]);
 console.log(JSON.stringify({case:'startup-and-close-failure',readyRejectedBeforeClose:true,handleBeforeEffects:true,events,report}));
}
{
 const ctx=new Context(),release=deferred(),reached=deferred();let started=0;
 const handle=start(ctx,[{id:'only',async setup(){started++;reached.resolve();await release.promise;},async close(){}}]);
 await reached.promise;const closing=handle.dispose();await assert.rejects(handle.ready,/stopped/);
 let done=false;closing.then(()=>{done=true;});await new Promise(r=>setTimeout(r,0));assert.equal(done,false);
 release.resolve();const report=await closing;assert.equal(report.complete,true);assert.equal(started,1);
 console.log(JSON.stringify({case:'cancel-during-setup',readyRejectedBeforeClose:true,waitedForActualSetup:true,report}));
}
