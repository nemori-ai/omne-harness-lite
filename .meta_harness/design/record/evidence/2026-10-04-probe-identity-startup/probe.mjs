// Mechanism evidence only. This does not change the accepted managed-binding protocol.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import {createAssemblyLifetime} from '../../../../../packages/core/assembly-lifecycle/dist/index.js';
const require=createRequire(new URL('../../../../../packages/core/kernel-basis/package.json',import.meta.url));
const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const results=[];
for(const mode of ['async-apply-effect-only','sync-apply-owned-ready']){
 const lifetime=createAssemblyLifetime(['row'],()=>{});lifetime.tryClaim();
 const ctx=new Context();const ready=Promise.withResolvers(),started=Promise.withResolvers(),release=Promise.withResolvers();
 const order=[];let acquired=false,closes=0,disposed=false,startupDone=false;
 async function setup(){started.resolve();await release.promise;acquired=true;order.push('acquired');if(!lifetime.isCurrent())throw Error('cancelled setup');}
 function install(inner){const registration=lifetime.port('row').register({ready:ready.promise,async close(){closes++;order.push('close');assert.equal(acquired,true)}});inner.effect(()=>async()=>{order.push('effect stop');registration.requestStop();await registration.closed});}
 const apply=mode==='async-apply-effect-only'?async function(inner){install(inner);try{await setup();ready.resolve()}catch(e){ready.reject(e)}}:function(inner){install(inner);void setup().then(ready.resolve,ready.reject)};
 const fiber=ctx.plugin({name:mode,apply});
 const startup=Promise.resolve(fiber).then(()=>{startupDone=true;return 'resolved'},()=>{startupDone=true;return 'rejected'});
 await started.promise;await tick();const before={current:lifetime.isCurrent(),startupDone,closes,acquired,state:fiber.state};
 const disposal=Promise.resolve(fiber.dispose()).then(()=>{disposed=true});await tick();
 const held={current:lifetime.isCurrent(),startupDone,disposed,closes,acquired,state:fiber.state};
 release.resolve();const report=await lifetime.closed;await disposal;await startup;
 results.push({mode,before,held,order,report,disposed});
 if(mode==='async-apply-effect-only'){assert.equal(held.current,true);assert.equal(held.startupDone,false);assert.equal(report.complete,true)}
 else{assert.equal(held.current,false);assert.equal(held.startupDone,true);assert.equal(held.disposed,false);assert.equal(held.closes,0);assert.deepEqual(report.rows,[{id:'row',result:{kind:'failed',codes:['setup']}}])}
}
writeFileSync(new URL('./result.json',import.meta.url),JSON.stringify({node:process.version,cordis:'4.0.4',results},null,2)+'\n');
console.log(JSON.stringify(results));
