import { readPublicHealth } from '../../../packages/frontend/governance-center-client/dist/index.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, X509Certificate } from 'node:crypto';
import assert from 'node:assert/strict';
import { makeCa,makeServerCertificate,keygen,freePort,opsDirectory,opsSocketOf,SETTINGS,envOf,CenterProcess } from '../../../apps/tenancy-host/tests/e2e/deploy.ts';
const root=mkdtempSync('/tmp/omne-client-real-');const quiet=()=>{};const processes=[];const outcomes=[];
try {
 const ca=makeCa(root,'ca',quiet); const tls=makeServerCertificate(root,'tls',ca,['DNS:localhost','IP:127.0.0.1'],quiet);
 for(const label of ['first','second']) {
  const dir=join(root,label);mkdirSync(dir);
  const deployment={dbFile:join(dir,'center.db'),keys:await keygen(join(dir,'keys'),quiet),host:'127.0.0.1',port:await freePort(),tls,opsDir:opsDirectory(root),settings:SETTINGS};
  const center=CenterProcess.serve(label,envOf(deployment),quiet);processes.push(center);
  const ops=await center.ready(opsSocketOf(deployment));
  const url=`https://127.0.0.1:${deployment.port}/`;
  const caResult=await readPublicHealth({url,trust:{mode:'ca',certificateAuthorities:ca.certPem}});
  assert.equal(caResult.kind,'health');assert.equal(caResult.reply.centerId,ops.centerId);
  const pin=createHash('sha256').update(new X509Certificate(tls.leafPem).publicKey.export({type:'spki',format:'der'})).digest('hex');
  const pinned=await readPublicHealth({url,trust:{mode:'spki',sha256:pin}});assert.deepEqual(pinned,caResult);
  const untrusted=await readPublicHealth({url});assert.equal(untrusted.kind,'unavailable');assert.equal(untrusted.reason,'trust');
  outcomes.push({label,caResult,pinMatches:true,systemTrustRejected:true});
 }
 assert.notEqual(outcomes[0].caResult.reply.centerId,outcomes[1].caResult.reply.centerId);
 writeFileSync(new URL('./result.json',import.meta.url),JSON.stringify({status:'pass',node:process.version,platform:process.platform,root,outcomes,scope:'Built public-health client against two real tenancy-host processes. No credentials or governance writes; same physical machine.'},null,2)+'\n');
 console.log(JSON.stringify({status:'pass',realCenters:2,requests:6,distinctCenterIds:true}));
} finally {for(const center of processes) {const exit=await center.terminate();assert.equal(exit.code,0);}}
