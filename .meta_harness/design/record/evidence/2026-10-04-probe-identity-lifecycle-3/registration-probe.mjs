import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {coordinator,deferred} from './lifetime-prototype.mjs';
const require=createRequire(path.resolve('packages/tenancy/account-registration/package.json'));
const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
const {generateHandoffKeyPair,loadSigningKey}=await import(pathToFileURL(path.resolve('packages/core/identity-values/dist/index.js')).href);
const {createRegistrationService}=await import(pathToFileURL(path.resolve('packages/tenancy/account-registration/dist/registration.js')).href);
const key=loadSigningKey(generateHandoffKeyPair().privateKeyPem);
assert.ok('ok' in key);
for(const step of [1,2])for(const qualified of [true,false]){
 const ctx=new Context(),blocked=deferred(),reached=deferred();
 const co=coordinator(['registration','entry']);let live=true,entryClosing=false;
 const calls=[];let task;
 const service=createRegistrationService({
  accounts:{async produce(){calls.push(1);if(step===1){reached.resolve();await blocked.promise;}return {ok:'00000000-0000-4000-8000-000000000001'};},async activate(){calls.push(3);return 'ok';},async purge(){throw new Error('unexpected purge');}},
  organizations:{async createPersonal(){calls.push(2);if(step===2){reached.resolve();await blocked.promise;}return {ok:'00000000-0000-4000-8000-000000000002'};}},
  organizationPurge:{async purgeForAccount(){throw new Error('unexpected purge');}},
  activationKey:key.ok,isActive:()=>live&&(!qualified||!co.stopping),recordDefect:()=>{throw new Error('unexpected defect');}
 });
 const receipt=co.port(0).register({ready:Promise.resolve(),async close(){live=false;await task;}});
 const registration=await ctx.plugin({name:'registration',apply(inner){inner.effect(()=>async()=>{receipt.requestStop();await receipt.closed;});}});
 const entryReceipt=co.port(1).register({ready:Promise.resolve(),async close(){entryClosing=true;await task;}});
 const entry=await ctx.plugin({name:'entry',apply(inner){inner.effect(()=>async()=>{entryReceipt.requestStop();await entryReceipt.closed;});}});
 task=service.register('probe@example.invalid','controlled credential');await reached.promise;
 const disposal=registration.dispose();await new Promise(r=>setTimeout(r,0));
 assert.equal(co.stopping,true);assert.equal(entryClosing,true);assert.equal(live,true);
 blocked.resolve();const outcome=await task;await disposal;const report=await co.close();
 assert.equal(outcome,qualified?'interrupted':'registered');
 assert.deepEqual(calls,qualified?(step===1?[1]:[1,2]):[1,2,3]);assert.equal(report.complete,true);
 console.log(JSON.stringify({case:qualified?'immediate-qualification-positive':'delayed-close-negative',pausedAt:step,entryCloseWaiting:true,registrationCloseNotYetStarted:true,outcome,calls,report}));
 await entry.dispose();await registration.dispose();
}
