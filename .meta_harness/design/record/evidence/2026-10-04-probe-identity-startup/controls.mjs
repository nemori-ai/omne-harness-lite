// Candidate projection probe, not a public implementation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import {createAssemblyLifetime} from '../../../../../packages/core/assembly-lifecycle/dist/index.js';
const require=createRequire(new URL('../../../../../packages/core/kernel-basis/package.json',import.meta.url));
const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function start(ctx,port,setup,close){
 const ready=Promise.withResolvers();const registration=port.register({ready:ready.promise,close});
 const failed=error=>{ready.reject(error);registration.requestStop()};
 try{ctx.effect(()=>async()=>{registration.requestStop();await registration.closed})}catch(e){failed(e);return}
 const check=()=>{ctx.fiber.assertActive();if(!port.isCurrent())throw Error('cancelled setup')};
 void Promise.resolve().then(async()=>{check();await setup();check()}).then(ready.resolve,failed);
}
const results=[];
{
 const c=createAssemblyLifetime(['row'],()=>{});c.tryClaim();const ctx=new Context();let setups=0,closes=0,disposal;
 const f=ctx.plugin(inner=>{start(inner,c.port('row'),async()=>{setups++},async()=>{closes++});disposal=inner.fiber.dispose()});
 const loading=Promise.resolve(f).then(()=>{},()=>{});const report=await c.closed;await loading;await disposal;
 assert.equal(setups,0);assert.equal(closes,1);assert.equal(report.complete,false);results.push({case:'cancel-before-scheduled-setup',setups,closes,report});
}
{
 const c=createAssemblyLifetime(['row'],()=>{});c.tryClaim();const ctx=new Context(),started=Promise.withResolvers(),release=Promise.withResolvers();let acquired=false,closes=0;
 const dependency=await ctx.plugin(inner=>{inner.provide('startupProbeDependency',{})});
 const f=ctx.plugin({name:'dependent-setup',inject:['startupProbeDependency'],apply(inner){start(inner,c.port('row'),async()=>{started.resolve();await release.promise;acquired=true},async()=>{assert.equal(acquired,true);closes++})}});
 await started.promise;await tick();const withdraw=dependency.dispose();await tick();assert.equal(c.isCurrent(),false);assert.equal(closes,0);release.resolve();const report=await c.closed;await withdraw;await f;await f.dispose();assert.equal(closes,1);assert.equal(report.complete,false);results.push({case:'required-provider-withdrawal-during-setup',closes,report});
}
{
 const c=createAssemblyLifetime(['row'],()=>{});c.tryClaim();const ctx=new Context();let inner,setups=0,closes=0;
 const f=await ctx.plugin(x=>{inner=x});await f.dispose();start(inner,c.port('row'),async()=>{setups++},async()=>{closes++;throw Error('private close failure')});
 const report=await c.closed;assert.equal(setups,0);assert.equal(closes,1);assert.deepEqual(report.rows,[{id:'row',result:{kind:'failed',codes:['setup','close']}}]);results.push({case:'effect-installation-failure-and-close-failure',setups,closes,report});
}
writeFileSync(new URL('./controls.json',import.meta.url),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
