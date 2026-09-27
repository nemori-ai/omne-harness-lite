import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStorage } from '../../../packages/infra/storage-sql/dist/index.js'
const atomic = (storage, fn) => storage.atomic(fn)
const dir = await mkdtemp(join(tmpdir(), 'omne-unit-probe-'))
const storage = await openStorage({ dialect: 'sqlite', file: join(dir, 'db.sqlite'), synchronous: 'full' })
const seen=[]
const count = () => storage.read(async tx => (await tx.db.selectFrom('probe').selectAll().execute()).length)
const insert = (unit,id) => unit.mutate(tx => tx.db.insertInto('probe').values({ id }).execute())
const rejected = async (name, fn) => { await assert.rejects(fn); seen.push(name) }
try {
  await storage.write(tx=>tx.db.schema.createTable('probe').addColumn('id','integer',x=>x.notNull()).addPrimaryKeyConstraint('probe_pkey',['id']).execute())
  await atomic(storage, async unit => {
    unit.assertStorage(storage)
    await unit.run(async () => { await insert(unit,1); await unit.run(()=>insert(unit,2)) })
    assert.equal((await unit.query(tx=>tx.db.selectFrom('probe').selectAll().execute())).length,2)
    unit.afterCommit(()=>seen.push('committed notification'))
  })
  assert.equal(await count(),2)
  let escaped
  await atomic(storage, async unit => { escaped=unit })
  assert.throws(()=>escaped.assertStorage(storage));seen.push('closed scope rejected')
  await rejected('caught operation error poisons transaction',()=>atomic(storage,async unit=>{
    try { await unit.run(async()=>{ await insert(unit,3); throw Error('synthetic failure') }) } catch {}
  }))
  assert.equal(await count(),2)
  await rejected('cross instance rejected',()=>atomic(storage,async unit=>{
    await insert(unit,3)
    try { unit.assertStorage({}) } catch {}
  }))
  assert.equal(await count(),2)
  await rejected('overlap rejected and drained',()=>atomic(storage,async unit=>{
    let release
    const barrier=new Promise(resolve=>{release=resolve})
    const first=unit.run(async()=>{await barrier;await insert(unit,3)})
    try { unit.run(()=>insert(unit,4)) } catch {}
    release()
    await first.catch(()=>{})
  }))
  assert.equal(await count(),2)
  await rejected('inflight at callback exit drained before rollback',()=>atomic(storage,async unit=>{
    unit.run(async()=>{await new Promise(resolve=>setTimeout(resolve,5));await insert(unit,3)})
  }))
  assert.equal(await count(),2)
  await atomic(storage,async unit=>unit.run(async()=>{
    await insert(unit,3)
    try {await insert(unit,3)} catch {}
    await insert(unit,4)
  }))
  assert.equal(await count(),4);seen.push('P2 handled inside operation remains usable')
  const notifications=[]
  await rejected('rollback discards notification',()=>atomic(storage,async unit=>{
    unit.afterCommit(()=>notifications.push('bad'))
    throw Error('synthetic rollback')
  }))
  assert.deepEqual(notifications,[])
  process.stdout.write(JSON.stringify({ node:process.version, platform:process.platform, arch:process.arch, checks:seen, count:seen.length, limits:'Built provider Linux smoke; not full Linux suite or physical-fault validation.' },null,2)+'\n')
} finally { await storage.close();await rm(dir,{recursive:true,force:true}) }
