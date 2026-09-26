import { readPublicHealth } from '/tmp/package/dist/index.js';
import { createServer } from 'node:tls';
import { readFileSync } from 'node:fs';
import { createHash, X509Certificate } from 'node:crypto';
import assert from 'node:assert/strict';
const cert=readFileSync('/certs/tls.chain.pem');const key=readFileSync('/certs/tls.key');const ca=readFileSync('/certs/ca.pem');
const health={reachable:true,centerId:'b'.repeat(32),version:'packed-linux-fixture'};let body=JSON.stringify(health);let status=200;const sockets=new Set();let requests=0;
const server=createServer({cert,key,minVersion:'TLSv1.3'},s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));s.on('error',()=>{});let input='';let sent=false;s.on('data',d=>{input+=d;const split=input.indexOf('\r\n\r\n');if(split<0||sent)return;const length=Number(/Content-Length: (\d+)/i.exec(input)?.[1]);if(input.length<split+4+length)return;sent=true;requests++;s.end(`HTTP/1.1 ${status} Response\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);});});
server.on('tlsClientError',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`https://127.0.0.1:${server.address().port}/`;
try {
 const options={url,trust:{mode:'ca',certificateAuthorities:ca}};
 assert.deepEqual(await readPublicHealth(options),{kind:'health',reply:health});
 const pin=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('hex');
 assert.deepEqual(await readPublicHealth({url,trust:{mode:'spki',sha256:pin}}),{kind:'health',reply:health});
 assert.deepEqual(await readPublicHealth({url,trust:{mode:'spki',sha256:'0'.repeat(64)}}),{kind:'unavailable',reason:'trust'});assert.equal(requests,2);
 status=503;body='"version-mismatch"';assert.deepEqual(await readPublicHealth(options),{kind:'entry-answer',answer:'version-mismatch'});
 assert.deepEqual(await readPublicHealth({...options,signal:AbortSignal.abort()}),{kind:'unavailable',reason:'cancelled'});assert.equal(requests,3);
 console.log(JSON.stringify({status:'pass',node:process.version,platform:process.platform,arch:process.arch,checks:5,requests,scope:'Packed artifact, isolated Linux TLS fixture; not production center or cross-machine test'}));
} finally {for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}
