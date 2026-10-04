// Exploratory claim and optional-dependency order, not the product loader.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {coordinator,deferred} from './lifetime-prototype.mjs';
const require=createRequire(path.resolve('packages/core/kernel-basis/package.json'));
const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
const tick=()=>new Promise(r=>setTimeout(r,0));
for(const guarded of [true,false]){
 const ctx=new Context(),co=coordinator(['row']);let claimed=false,applies=0;const fibers=[];
 function load(){
  if(guarded){if(claimed||co.stopping)throw new Error('lifetime-used');claimed=true;}
  const ready=deferred();void ready.promise.catch(()=>{});
  queueMicrotask(async()=>{
   if(co.stopping){ready.reject(new Error('stopped'));return;}
   try{
    const fiber=ctx.plugin({name:'row',apply(inner){
     const receipt=co.port(0).register({ready:Promise.resolve(),async close(){}});applies++;
     inner.effect(()=>async()=>{receipt.requestStop();await receipt.closed;});
    }});fibers.push(fiber);await fiber;ready.resolve();
   }catch(error){ready.reject(error);}
  });
  return {ready:ready.promise,dispose:()=>co.close()};
 }
 const first=load();let secondRejected=false;
 if(guarded){assert.throws(()=>load(),/lifetime-used/);secondRejected=true;}
 else {const second=load();await second.dispose();await assert.rejects(second.ready,/stopped/);}
 if(guarded){await first.ready;assert.equal(co.stopping,false);assert.equal(applies,1);}
 else {await assert.rejects(first.ready,/stopped/);assert.equal(applies,0);}
 await first.dispose();for(const f of fibers)await f.dispose();
 console.log(JSON.stringify({case:guarded?'synchronous-claim-positive':'unclaimed-control-negative',secondRejected,firstUnaffected:guarded,applies}));
}
function checkOrder(rows){
 const providers=new Map();rows.forEach((r,i)=>r.provides.forEach(key=>providers.set(key,i)));
 rows.forEach((r,i)=>r.optional.forEach(key=>{if(providers.has(key)&&providers.get(key)>=i)throw new Error('service-order');}));
}
const backend={id:'backend',provides:['optionalBackend'],optional:[]};
const consumer={id:'consumer',provides:[],optional:['optionalBackend']};
assert.throws(()=>checkOrder([consumer,backend]),/service-order);checkOrder([backend,consumer]);checkOrder([consumer]);
for(const safeOrder of [true,false]){
 const rows=safeOrder?[backend,consumer]:[consumer,backend];
 const ctx=new Context(),co=coordinator(rows.map(r=>r.id)),release=deferred();
 let backendOpen=true;const events=[];const job=release.promise.then(()=>{events.push('consumer-continuation');return backendOpen?'saved':'backend-closed';});
 const fibers=[];
 for(let i=0;i<rows.length;i++){
  const row=rows[i];const receipt=co.port(i).register({ready:Promise.resolve(),async close(){
   events.push(row.id+'-close-start');if(row.id==='consumer')await job;else backendOpen=false;
   events.push(row.id+'-close-end');
  }});
  const f=await ctx.plugin({name:row.id,apply(inner){inner.effect(()=>async()=>{receipt.requestStop();await receipt.closed;});}});fibers.push(f);
 }
 const stopped=fibers[rows.findIndex(r=>r.id==='backend')].dispose();await tick();
 assert.equal(backendOpen,safeOrder);release.resolve();const result=await job;await stopped;await co.close();
 assert.equal(result,safeOrder?'saved':'backend-closed');for(const f of fibers)await f.dispose();
 console.log(JSON.stringify({case:safeOrder?'optional-order-positive':'ignored-optional-edge-negative',result,events}));
}
