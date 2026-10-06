import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {coordinator,deferred} from './lifetime-prototype.mjs';
const require=createRequire(path.resolve('packages/core/kernel-basis/package.json'));
const {Context,Service}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
const tick=()=>new Promise(r=>setTimeout(r,0));
class Lifetime extends Service{
 static provide='assemblyLifetime';
 constructor(ctx,port){super(ctx,Lifetime.provide);this.port=port;}
 register(work){return this.port.register(work);}
}
async function fixture(direct){
 const ctx=new Context(), gate=deferred();const order=[];
 let backendAlive=true,entered=true;
 const co=coordinator(['state','client'],()=>{entered=false;order.push('admission-stopped');});
 const slotFibers=[];
 async function scope(index){
  const scoped=ctx.isolate('assemblyLifetime');
  slotFibers.push(await scoped.plugin({name:'lifetime-slot-'+index,apply(inner){new Lifetime(inner,co.port(index));}}));
  return scoped;
 }
 const a=await scope(0);const b=await scope(1);
 const backend=await a.plugin({name:'state',inject:['assemblyLifetime'],apply(inner){
  const receipt=inner.get('assemblyLifetime').register({ready:Promise.resolve(),async close(){backendAlive=false;order.push('state-close');}});
  inner.provide('testState',{cas(){order.push(backendAlive?'cas-saved':'cas-closed');return backendAlive;}});
  inner.effect(()=>async()=>{
   if(direct){backendAlive=false;order.push('direct-state-close');}
   receipt.requestStop();await receipt.closed;
  });
 }});
 let admitted;
 const client=await b.plugin({name:'client',inject:['assemblyLifetime','testState'],apply(inner){
  const state=inner.get('testState');
  admitted=(async()=>{order.push('remote-start');await gate.promise;order.push('remote-result');return state.cas();})();
  const receipt=inner.get('assemblyLifetime').register({ready:Promise.resolve(),async close(){order.push('client-drain');await admitted;order.push('client-close');}});
  inner.effect(()=>async()=>{receipt.requestStop();await receipt.closed;});
 }});
 const retiring=backend.dispose();await tick();
 assert.equal(entered,false);assert.ok(order.includes('client-drain'));
 if(!direct)assert.equal(backendAlive,true);
 const during=[...order];gate.resolve();const saved=await admitted;await retiring;
 const report=await co.close();await client.dispose();for(const f of slotFibers.reverse())await f.dispose();
 assert.equal(saved,!direct);assert.equal(report.complete,true);
 if(!direct)assert.ok(order.indexOf('client-close')<order.indexOf('state-close'));
 console.log(JSON.stringify({name:direct?'negative-direct-close':'managed-provider-withdrawal',during,order,saved,report}));
}
await fixture(false);await fixture(true);
{
 const events=[];const c=coordinator(['first','second']);
 c.port(0).register({ready:Promise.resolve(),async close(){events.push('first');throw new Error('private first failure');}});
 c.port(1).register({ready:Promise.resolve(),async close(){events.push('second');throw new Error('private second failure');}});
 const p=c.close();assert.equal(c.close(),p);const report=await p;
 assert.equal(report.complete,false);assert.deepEqual(events,['second','first']);assert.equal(report.rows.filter(r=>r.errors.includes('close')).length,2);
 console.log(JSON.stringify({name:'both-close-failures',report}));
}
{
 const c=coordinator(['partial']);const setup=deferred();let cleaned=false;
 c.port(0).register({ready:setup.promise,async close(){cleaned=true;}});
 const p=c.close();await tick();assert.equal(cleaned,false);setup.reject(new Error('private setup failure'));
 const report=await p;assert.equal(cleaned,true);assert.equal(report.complete,false);assert.deepEqual(report.rows[0].errors,['setup']);
 console.log(JSON.stringify({name:'partial-setup',report}));
}
{
 let confirmed=false,open=false;
 const c=coordinator(['store','entry'],()=>{open=false;});
 const store=c.port(0),entry=c.port(1);
 store.register({ready:Promise.resolve(),async close(){}});
 entry.register({ready:Promise.resolve(),async close(){}});
 assert.equal(open,false);confirmed=true;open=confirmed&&!c.stopping;assert.equal(open,true);
 assert.throws(()=>store.register({ready:Promise.resolve(),async close(){}}),/registration-rejected/);
 assert.equal(open,false);assert.equal(c.stopping,true);await c.close();
 console.log(JSON.stringify({name:'second-generation-rejected',confirmed,open,stopping:c.stopping}));
}
console.log(JSON.stringify({name:'summary',positiveCases:5,negativeControls:1,passed:true}));
