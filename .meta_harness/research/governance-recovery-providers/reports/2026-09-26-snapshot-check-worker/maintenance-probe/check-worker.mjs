import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
if (!isMainThread) {
 const check = new DatabaseSync(workerData.file, {readOnly:true}); let result
 try { const a=check.prepare('PRAGMA integrity_check').all(); const b=check.prepare('PRAGMA foreign_key_check').all(); result={valid:a.length===1&&Object.values(a[0])[0]==='ok'&&b.length===0} } finally {check.close()}
 parentPort.postMessage(result); parentPort.close()
} else {
const dir = await mkdtemp(join(tmpdir(), 'omne-inspect-blocking-'))
let db
try {
 db = new DatabaseSync(join(dir, 'probe.sqlite'))
 db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA foreign_keys=ON; CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id), tag TEXT NOT NULL, payload BLOB NOT NULL); CREATE INDEX child_parent ON child(parent_id); CREATE INDEX child_tag ON child(tag); CREATE UNIQUE INDEX child_pair ON child(parent_id,id); BEGIN')
 const p = db.prepare('INSERT INTO parent VALUES (?)'); for(let i=0;i<1000;i++) p.run(i)
 const q = db.prepare('INSERT INTO child VALUES (?,?,?,zeroblob(700))')
 const start=performance.now()
 for(let i=0;i<1_000_000;i++) q.run(i,i%1000,'tag-'+(i%10000))
 db.exec('COMMIT')
 const buildMs=performance.now()-start
 const size=(await stat(join(dir,'probe.sqlite'))).size
 const observations=[]
 for (const sql of ['PRAGMA integrity_check','PRAGMA foreign_key_check']) {
  await new Promise(r=>setTimeout(r,10))
  const before=performance.now(); let tick
  const timer=new Promise(resolve=>setTimeout(()=>{tick=performance.now()-before;resolve()},10))
  const rows=db.prepare(sql).all(); const elapsed=performance.now()-before
  await timer
  observations.push({sql,elapsedMs:elapsed,timerDelayMs:tick,rows:rows.length,valid:sql.includes('integrity')?rows.length===1&&Object.values(rows[0])[0]==='ok':rows.length===0})
 }
 let ticks=0; let last=performance.now(); let maxGap=0; const workerStart=last; let messageAt; let exitAt; let workerResult
 const ticker=setInterval(()=>{const n=performance.now(); maxGap=Math.max(maxGap,n-last);last=n;ticks++},10)
 const worker=new Worker(new URL(import.meta.url),{workerData:{file:join(dir,'probe.sqlite')}})
 await new Promise((resolve,reject)=>{worker.on('message',m=>{workerResult=m;messageAt=performance.now()-workerStart});worker.on('error',reject);worker.on('exit',c=>{exitAt=performance.now()-workerStart;c===0?resolve():reject(new Error('worker exit '+c))})})
 clearInterval(ticker); observations.push({workerResult,messageAt,exitAt,ticks,maxGapMs:maxGap})
 console.log(JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,rows:1_000_000,bytes:size,buildMs,observations,scope:'synthetic unencrypted disposable data; build durability OFF only for fixture; query event-loop blocking, not product availability'},null,2))
} finally {db?.close();await rm(dir,{recursive:true,force:true})}

}
