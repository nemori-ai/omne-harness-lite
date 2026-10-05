import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import net from 'node:net';
import assert from 'node:assert/strict';
import {coordinator,deferred} from './lifetime-prototype.mjs';
const require=createRequire(path.resolve('packages/core/kernel-basis/package.json'));
const {Context}=await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
const tick=()=>new Promise(r=>setTimeout(r,0));
for(const guarded of [true,false]){
 const root=await mkdtemp('/tmp/omne-dual-face-');const socketPath=path.join(root,'ops.sock');
 const ctx=new Context(),tail=deferred(),entryWork=deferred(),ready=deferred();
 let noticeOpen=true,confirmed=true,stopListenerCalled=0;
 const co=coordinator(['ops','entry','tail'],()=>{if(guarded)throw new Error('observer failure');});
 const isOpen=()=>confirmed&&!co.stopping;let accepted=0;
 const server=net.createServer(socket=>{
  const allow=noticeOpen&&(!guarded||isOpen());if(allow)accepted++;
  socket.end(allow?'accepted':'rejected');
 });
 const receipt=co.port(0).register({ready:ready.promise,close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))});
 const ops=await ctx.plugin({name:'ops',apply(inner){
  inner.on('probe/stopped',()=>{noticeOpen=false;stopListenerCalled++;});
  inner.effect(()=>async()=>{receipt.requestStop();await receipt.closed;});
 }});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});ready.resolve();
 const entryReceipt=co.port(1).register({ready:Promise.resolve(),async close(){await entryWork.promise;}});
 const entry=await ctx.plugin({name:'entry',apply(inner){inner.effect(()=>async()=>{entryReceipt.requestStop();await entryReceipt.closed;});}});
 const tailReceipt=co.port(2).register({ready:Promise.resolve(),async close(){await tail.promise;}});
 const helper=await ctx.plugin({name:'tail',apply(inner){inner.effect(()=>async()=>{tailReceipt.requestStop();await tailReceipt.closed;});}});
 try{
  const stopping=ops.dispose();await tick();ctx.emit('probe/stopped');assert.equal(stopListenerCalled,0);
  assert.equal(co.stopping,true);assert.equal(server.listening,true);assert.equal(isOpen(),false);
  const response=await new Promise((resolve,reject)=>{
   const connection=net.createConnection(socketPath);let value='';
   connection.setTimeout(1000,()=>{connection.destroy();reject(new Error('bounded probe connection timed out'));});
   connection.on('data',chunk=>{value+=chunk;});connection.on('end',()=>resolve(value));connection.on('error',reject);
  });
  assert.equal(response,guarded?'rejected':'accepted');
  tail.resolve();entryWork.resolve();await stopping;const report=await co.close();
  assert.equal(report.complete,!guarded); // The positive path preserves the deliberately injected observer error.
  console.log(JSON.stringify({case:guarded?'shared-gate-positive':'listener-only-negative',listenerRemoved:true,resourcesStillOpenDuringRequest:true,response,accepted,report}));
 }finally{
  tail.resolve();entryWork.resolve();await co.close();await helper.dispose();await entry.dispose();await ops.dispose();await rm(root,{recursive:true,force:true});
 }
}
