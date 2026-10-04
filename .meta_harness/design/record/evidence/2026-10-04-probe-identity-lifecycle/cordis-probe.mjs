import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(path.resolve('packages/core/kernel-basis/package.json'));
const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const checks=[];
function record(name,data){checks.push({name,...data});console.log(JSON.stringify(checks.at(-1)));}
// Standard Schema returns a transformed value. Pass the raw captured input to Cordis,
// never the already transformed preflight result.
{
 const ctx=new Context();let seen,validations=0;
 const Config={'~standard':{version:1,vendor:'probe',validate(input){validations++;return {value:{n:input.n+1}};}}};
 const plugin={name:'config-probe',Config,apply(_ctx,config){seen=config;}};
 const raw={n:1};assert.deepEqual(Config['~standard'].validate(raw),{value:{n:2}});
 const handle=ctx.plugin(plugin,raw);const fiber=await handle;
 assert.deepEqual(seen,{n:2});assert.equal(validations,2);assert.notEqual(handle,fiber);
 assert.equal(Object.getPrototypeOf(handle),fiber);
 await fiber.dispose();record('config-and-ready',{validations,received:seen,wrapperDiffers:true});
 const asyncPlugin={name:'async-config-probe',Config:{'~standard':{version:1,vendor:'probe',async validate(v){return {value:v};}}},apply(){throw new Error('must not apply');}};
 await assert.rejects(async () => await ctx.plugin(asyncPlugin,{}),/Async config validation/);
 record('async-schema-rejected',{passed:true});
}
// Awaiting the real fiber has a reliable completion result; retain both objects to
// test whether wrapper disposal would accidentally bypass the lifecycle receiver.
{
 const ctx=new Context();const gate=deferred();let completed=false;
 const handle=ctx.plugin({name:'wrapper-probe',apply(inner){inner.effect(()=>async()=>{await gate.promise;completed=true;});}});
 const fiber=await handle;let disposalReturned=false;
 const disposal=handle.dispose().then(()=>{disposalReturned=true;});
 await tick();const before={completed,disposalReturned};gate.resolve();await disposal;await fiber.await();
 assert.equal(completed,true);record('wrapper-disposal',{before,after:{completed,disposalReturned}});
}
{
 const ctx=new Context();const gate=deferred();const order=[];let closeReturned=false;
 const first=await ctx.plugin({name:'first',apply(inner){inner.effect(()=>()=>{order.push('first-close');});}});
 const second=await ctx.plugin({name:'second',apply(inner){inner.effect(()=>async()=>{order.push('second-start');await gate.promise;order.push('second-end');});}});
 const closing=(async()=>{await second.dispose();await first.dispose();closeReturned=true;})();
 await tick();assert.deepEqual(order,['second-start']);assert.equal(closeReturned,false);
 gate.resolve();await closing;assert.deepEqual(order,['second-start','second-end','first-close']);
 record('explicit-reverse-await',{order,passed:true});
}
{
 const ctx=new Context();const order=[];
 const f=await ctx.plugin({name:'swallowed-failure',apply(inner){inner.effect(()=>()=>{order.push('throw');throw new Error('probe disposal failure');});inner.effect(()=>()=>{order.push('other');});}});
 let rejected=false;await f.dispose().catch(()=>{rejected=true;});
 assert.equal(rejected,false);assert.ok(order.includes('throw'));assert.ok(order.includes('other'));
 record('negative-dispose-errors-do-not-propagate',{rejected,order});
}
// A required provider's effect can complete before the consumer's whole admitted
// promise. inject does not establish a consumer-before-provider drain barrier.
{
 const ctx=new Context();const gate=deferred();const order=[];
 const provider=await ctx.plugin({name:'dep',apply(inner){inner.provide('probeStore',{});inner.effect(()=>()=>{order.push('provider-close');});}});
 const consumer=await ctx.plugin({name:'use',inject:['probeStore'],apply(inner){inner.effect(()=>async()=>{order.push('consumer-stop');await gate.promise;order.push('consumer-done');});}});
 const stopping=provider.dispose();await tick();assert.ok(order.includes('provider-close'));assert.ok(!order.includes('consumer-done'));
 const before=[...order];gate.resolve();await stopping;await consumer.dispose();
 record('negative-inject-no-drain-barrier',{before,after:order});
}
record('summary',{checks:checks.length,allAssertionsPassed:true});
