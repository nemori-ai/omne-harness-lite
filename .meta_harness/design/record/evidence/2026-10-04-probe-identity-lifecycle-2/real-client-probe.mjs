import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {mkdtemp,rm,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {coordinator,deferred} from './lifetime-prototype.mjs';
const require=createRequire(path.resolve('packages/core/kernel-basis/package.json'));
const {Context,Service}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
const {openClientLocalState}=await import(pathToFileURL(path.resolve('packages/frontend/client-local-state/dist/index.js')).href);
const {Client}=await import(pathToFileURL(path.resolve('packages/frontend/governance-client-operations/dist/client.js')).href);
class State extends Service{
 static provide='probeLocalState';
 constructor(ctx,state){super(ctx,State.provide);this.state=state;}
 read(){return this.state.read();}
 compareAndReplace(...args){return this.state.compareAndReplace(...args);}
}
for(const direct of [false,true]){
 const root=await mkdtemp(path.join(await realpath('/tmp'),'omne-lifecycle-'));
 const directory=path.join(root,'state');const state=await openClientLocalState({directory});
 const context=new Context(),entered=deferred(),gate=deferred(),closed=deferred(),order=[];
 let client;let stateFiber,clientFiber;
 try{
  const reading=await state.read();assert.equal(reading.kind,'read');
  const center={centerId:'11111111111111111111111111111111',endpoint:'https://center.example.invalid/',trust:{mode:'ca'}};
  assert.equal((await state.compareAndReplace(reading.snapshot.token,{center,cache:[]},randomUUID())).kind,'installed');
  const life=coordinator(['state','client'],()=>order.push('stopping'));
  stateFiber=await context.plugin({name:'real-state',apply(inner){
   const receipt=life.port(0).register({ready:Promise.resolve(),async close(){await state.close();order.push('state-closed');}});
   new State(inner,state);
   inner.effect(()=>async()=>{if(direct){await state.close();order.push('direct-state-close');closed.resolve();}receipt.requestStop();await receipt.closed;});
  }});
  clientFiber=await context.plugin({name:'real-client',inject:['probeLocalState'],apply(inner){
   client=new Client({state:inner.get('probeLocalState'),timeoutMs:1000,
    health:async()=>({kind:'health',reply:{reachable:true,centerId:center.centerId,version:'probe'}}),
    exchange:async()=>{entered.resolve();await gate.promise;return {kind:'reply',reply:{result:{loginState:'probe-private-bearer',loginStateHandle:'new-handle'}},sendAttempted:true};},
    observedAt:()=> '2026-10-04T17:00:00Z'});
   const receipt=life.port(1).register({ready:Promise.resolve(),async close(){order.push('client-drain');await client.close();order.push('client-closed');}});
   inner.effect(()=>async()=>{receipt.requestStop();await receipt.closed;});
  }});
  const action=client.runAction({action:'login',payload:{loginIdentifier:'person',credential:'probe-private-credential'}});
  await entered.promise;
  const disposed=stateFiber.dispose();
  if(direct)await closed.promise;else await new Promise(r=>setTimeout(r,0));
  gate.resolve();const report=await action;await disposed;const closeReport=await life.close();
  assert.equal(report.remote.status,'success');assert.equal(report.local.status,direct?'defect':'installed');
  assert.equal(closeReport.complete,true);
  const reopened=await openClientLocalState({directory});
  try{const current=await reopened.read();assert.equal(current.kind,'read');assert.equal(current.snapshot.value.login?.handle,direct?undefined:'new-handle');}
  finally{await reopened.close();}
  console.log(JSON.stringify({case:direct?'direct-close-negative':'managed-close-positive',remote:report.remote.status,local:report.local.status,defect:report.defect?.stage??null,order,durableLoginInstalled:!direct}));
 }finally{
  gate.resolve();await client?.close();await state.close();await clientFiber?.dispose();await stateFiber?.dispose();await rm(root,{recursive:true,force:true});
 }
}
