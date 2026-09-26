// Node24 SQLite candidate probe; synthetic state only, no production client claim.
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
process.umask(0o077);
const filename=fileURLToPath(import.meta.url);
function open(path) { const db=new DatabaseSync(path,{timeout:1500});db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');return db; }
const [mode,path,arg]=process.argv.slice(2);
if(mode==='cas') {
  const db=open(path);db.exec('BEGIN IMMEDIATE');
  const result=db.prepare('UPDATE state SET revision=revision+1, operation=? WHERE id=1 AND revision=0 RETURNING revision').get(arg);
  db.exec('COMMIT');db.close();process.send({won:result!==undefined,operation:arg});
} else if(mode==='hold') {
  const db=open(path);db.exec('BEGIN IMMEDIATE');db.exec("UPDATE state SET revision=999,operation='uncommitted' WHERE id=1");
  process.send({held:true});setInterval(()=>{},1000);
} else {
  const dir=mkdtempSync(join(tmpdir(),'omne-state-')); const dbpath=join(dir,'state.db'); const results=[];
  const db=open(dbpath);db.exec("CREATE TABLE state(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL,operation TEXT NOT NULL);INSERT INTO state VALUES(1,0,'initial')");
  function child(kind,value){const p=spawn(process.execPath,[filename,kind,dbpath,value],{stdio:['ignore','ignore','pipe','ipc']});let err='';p.stderr.on('data',d=>err+=d);const done=new Promise((resolve,reject)=>{let message;p.on('message',m=>message=m);p.on('error',reject);p.on('exit',(code,signal)=>code===0?resolve(message):reject(new Error(JSON.stringify({code,signal,err}))));});return {p,done};}
  const competing=['first','second','third','fourth'].map(n=>child('cas',n));const cas=await Promise.all(competing.map(x=>x.done));assert.equal(cas.filter(x=>x.won).length,1);assert.equal(db.prepare('SELECT revision FROM state').get().revision,1);results.push({case:'four-process-cas',outcomes:cas});
  const held=child('hold',''); held.done.catch(()=>{});await new Promise((resolve,reject)=>{held.p.once('message',resolve);held.p.once('error',reject);held.p.once('exit',()=>reject(new Error('holder exited before ready')));});
  const permissions=readdirSync(dir).map(name=>({name,mode:statSync(join(dir,name)).mode&0o777}));for(const item of permissions)assert.equal(item.mode,0o600);assert.equal(statSync(dir).mode&0o777,0o700);results.push({case:'state-and-sidecar-permissions',permissions});
  held.p.kill('SIGKILL');await new Promise(resolve=>held.p.once('exit',resolve));
  db.close();const reopened=open(dbpath);assert.equal(reopened.prepare('SELECT revision FROM state').get().revision,1);reopened.exec("BEGIN IMMEDIATE;UPDATE state SET revision=2,operation='after-kill' WHERE id=1;COMMIT");assert.equal(reopened.prepare('SELECT revision FROM state').get().revision,2);results.push({case:'killed-uncommitted-writer',rolledBackRevision:1,nextCommittedRevision:2});
  const sqlite=reopened.prepare('SELECT sqlite_version() AS version').get().version;reopened.close();
  const report={status:'pass',node:process.version,sqlite,platform:process.platform,arch:process.arch,dir,results,limits:['No physical power loss','No fsync error injection','No hostile same-UID process or path-swap test','Only the reported process platform; no full client integration','No client schema/permission policy acceptance']};writeFileSync(new URL('./result.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,node:report.node,sqlite,cases:results.length}));
}
