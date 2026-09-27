// Isolated Node24 HTTPS compatibility probe against a hostile synthetic TLS peer.
import { request } from 'node:https';
import { createServer } from 'node:tls';
import { X509Certificate, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { makeCa, makeServerCertificate } from '../../../apps/tenancy-host/tests/e2e/deploy.ts';
process.umask(0o077);
const dir=mkdtempSync('/tmp/omne-client-tls-');const noLog=()=>{};
const ca=makeCa(dir,'probe-ca',noLog);const rogue=makeCa(dir,'rogue-ca',noLog);
const cert=makeServerCertificate(dir,'server',ca,['DNS:localhost'],noLog);
const pin=createHash('sha256').update(new X509Certificate(cert.leafPem).publicKey.export({type:'spki',format:'der'})).digest('hex');
const health=JSON.stringify({reachable:true,centerId:'a'.repeat(32),version:'probe-only'});
let response={status:200,body:health};let received=0;let connections=0;const sockets=new Set();
function reply(body,status=200,length=Buffer.byteLength(body)) {return `HTTP/1.1 ${status} Probe\r\nContent-Type: application/json\r\nContent-Length: ${length}\r\nConnection: close\r\n\r\n${body}`;}
const server=createServer({cert:cert.leafPem,key:cert.keyPem,minVersion:'TLSv1.3'},socket=>{
  connections++;sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  let input=Buffer.alloc(0);let answered=false;
  socket.on('data',chunk=>{received+=chunk.length;input=Buffer.concat([input,chunk]);const end=input.indexOf('\r\n\r\n');if(end<0||answered)return;const head=input.subarray(0,end).toString();const match=/\r\nContent-Length: (\d+)/i.exec(head);if(!match||input.length<end+4+Number(match[1]))return;answered=true;assert.match(head,/^POST \/ HTTP\/1\.1/);assert.doesNotMatch(head,/transfer-encoding|authorization|expect:/i);socket.end(reply(response.body,response.status,response.length));});
});
server.on('tlsClientError',()=>{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
function call({caBytes=ca.certPem,spki,servername='localhost',body='{"operation":"composition.governance-center-entry/v1#S-18"}'}={}){
 return new Promise(resolve=>{
  let sent=false,finished=false;const end=result=>{if(finished)return;finished=true;clearTimeout(timer);req.destroy();resolve({...result,sent});};
  const req=request({host:'127.0.0.1',port,servername,method:'POST',path:'/',agent:false,minVersion:'TLSv1.3',ca:caBytes,rejectUnauthorized:spki===undefined,maxHeaderSize:16384,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'Connection':'close'}},res=>{
   const size=res.headers['content-length'];if(res.httpVersion!=='1.1'||typeof size!=='string'||!/^\d+$/.test(size)||res.headers['transfer-encoding']!==undefined||Number(size)>4096){end({kind:'unavailable',reason:'framing'});return;}
   const chunks=[];let bytes=0;res.on('data',chunk=>{bytes+=chunk.length;if(bytes>4096)end({kind:'unavailable',reason:'limit'});else chunks.push(chunk);});res.on('aborted',()=>end({kind:'unavailable',reason:'truncated'}));res.on('error',()=>end({kind:'unavailable',reason:'response-error'}));res.on('end',()=>{
    if(bytes!==Number(size)){end({kind:'unavailable',reason:'truncated'});return;}
    const raw=Buffer.concat(chunks);if(raw.equals(Buffer.from('"version-mismatch"'))){end({kind:'version-mismatch'});return;}
    if(res.statusCode!==200){end({kind:'unavailable',reason:'status'});return;}
    let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{end({kind:'unavailable',reason:'json'});return;}
    if(typeof value==='object'&&value!==null&&Object.keys(value).sort().join() === 'centerId,reachable,version'&&value.reachable===true&&/^[0-9a-f]{32}$/.test(value.centerId)&&typeof value.version==='string'&&value.version.length>0)end({kind:'health'});else end({kind:'unavailable',reason:'shape'});
   });
  });
  const timer=setTimeout(()=>end({kind:'unavailable',reason:'deadline'}),2000);
  req.on('error',error=>end({kind:sent?'unavailable':'trust-or-connect',code:error.code??'probe-rejection'}));
  req.on('socket',socket=>socket.once('secureConnect',()=>{
   if(spki!==undefined){const x=socket.getPeerX509Certificate();const actual=x&&createHash('sha256').update(x.publicKey.export({type:'spki',format:'der'})).digest('hex');if(actual!==spki){req.destroy(new Error('pin mismatch'));return;}}
   sent=true;req.end(body);
  }));
 });
}
const results=[];
try{
 async function check(name,opts,wanted){const before=received;const result=await call(opts);assert.equal(result.kind,wanted,name);if(wanted==='trust-or-connect'){assert.equal(result.sent,false);assert.equal(received,before);}results.push({name,...result,applicationBytes:received-before});}
 await check('CA health',{},'health');
 await check('untrusted CA does not send synthetic secret',{caBytes:rogue.certPem,body:'{"synthetic":"DO-NOT-TRANSMIT"}'},'trust-or-connect');
 await check('wrong hostname does not send synthetic secret',{servername:'wrong.invalid',body:'{"synthetic":"DO-NOT-TRANSMIT"}'},'trust-or-connect');
 await check('SPKI alternative',{spki:pin,caBytes:rogue.certPem},'health');
 await check('wrong SPKI does not send synthetic secret',{spki:'0'.repeat(64),body:'{"synthetic":"DO-NOT-TRANSMIT"}'},'trust-or-connect');
 response={status:503,body:'"version-mismatch"'};await check('exact version bytes precede status',{},'version-mismatch');
 response={status:200,body:' "version-mismatch"'};await check('non-exact version string rejected',{},'unavailable');
 response={status:302,body:health};const before=connections;await check('redirect not followed',{},'unavailable');assert.equal(connections-before,1);
 response={status:200,body:health.slice(0,-5),length:Buffer.byteLength(health)};await check('truncated body rejected',{},'unavailable');
 response={status:200,body:'{"result":"ok"}'};await check('other-route success rejected for health',{},'unavailable');
 const report={status:'pass',node:process.version,platform:process.platform,arch:process.arch,results,limits:['Synthetic TLS server, not production center','Only public-health result parser, not 27-route codec','No Linux test','No full framing fuzzing, TLS downgrade or elapsed-deadline load test','No production command or local secret persistence']};writeFileSync(new URL('./result.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:results.length}));
}finally{for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));}
