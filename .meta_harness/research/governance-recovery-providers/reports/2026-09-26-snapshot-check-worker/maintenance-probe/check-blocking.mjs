import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
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
 console.log(JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,rows:1_000_000,bytes:size,buildMs,observations,scope:'synthetic unencrypted disposable data; build durability OFF only for fixture; query event-loop blocking, not product availability'},null,2))
} finally {db?.close();await rm(dir,{recursive:true,force:true})}
