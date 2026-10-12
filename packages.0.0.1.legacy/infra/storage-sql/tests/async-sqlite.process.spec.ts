// @module-tag slow
// Real worker startup and a deliberately expensive SQL query exercise event-loop isolation.
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AsyncSqliteDatabase } from '../src/sqlite/async-database.ts'
import { acquireSqliteLock, SqliteLockBusy } from '../src/sqlite/lock.ts'
import { openStorage } from '../src/open.ts'

const roots: string[] = []
const handles: AsyncSqliteDatabase[] = []
async function open() {
  const root = await mkdtemp(join(tmpdir(), 'omne-async-sql-'))
  roots.push(root)
  const db = new AsyncSqliteDatabase(join(root, 'database.sqlite'))
  handles.push(db)
  await db.ready
  return db
}
afterEach(async () => {
  for (const db of handles.splice(0)) await db.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('native SQLite runs outside the application event loop', () => {
  it('runs four read transactions concurrently and queues the fifth', async () => {
    const root = await mkdtemp(join(tmpdir(), 'omne-async-pool-'))
    roots.push(root)
    const workers = new Set<Worker>()
    const on = Worker.prototype.on
    const registration = vi.spyOn(Worker.prototype, 'on').mockImplementation(function (
      this: Worker,
      event,
      listener,
    ) {
      workers.add(this)
      return on.call(this, event, listener)
    })
    const storage = await openStorage({ dialect: 'sqlite', file: join(root, 'db.sqlite') })
    const gates = Array.from({ length: 4 }, () => Promise.withResolvers<void>())
    const entered = Array.from({ length: 4 }, () => Promise.withResolvers<void>())
    const readers = gates.map((gate, i) =>
      storage.read(async () => {
        entered[i]!.resolve()
        await gate.promise
      }),
    )
    try {
      await Promise.all(entered.map(gate => gate.promise))
      expect(workers.size).toBe(5) // One writer and the four admitted native readers.
      let fifthEntered = false
      const fifth = storage.read(async () => {
        fifthEntered = true
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(fifthEntered).toBe(false)
      // A cold fifth worker would also wait for startup; count actual allocations as well.
      expect(workers.size).toBe(5)
      gates[0]!.resolve()
      await fifth
      expect(fifthEntered).toBe(true)
    } finally {
      for (const gate of gates) gate.resolve()
      await Promise.all(readers)
      await storage.close()
      registration.mockRestore()
    }
  })

  it('does not finish failed close on an error event before the worker exits', async () => {
    const db = await open()
    const post = Worker.prototype.postMessage
    let worker: Worker | undefined
    const failure = new Error('injected worker error before exit')
    const fault = vi.spyOn(Worker.prototype, 'postMessage').mockImplementation(function (
      this: Worker,
      message,
    ) {
      if (message.command?.sql === "SELECT 'error-before-exit'") {
        worker = this
        this.emit('error', failure)
      } else post.call(this, message)
    })
    try {
      await expect(db.get("SELECT 'error-before-exit'")).rejects.toBe(failure)
      let settled = false
      const closing = db.close().catch(error => {
        settled = true
        return error
      })
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(settled).toBe(false)
      expect(db.isOpen).toBe(true)
      await worker!.terminate()
      expect(await closing).toBe(failure)
      expect(db.isOpen).toBe(false)
      handles.splice(handles.indexOf(db), 1)
    } finally {
      fault.mockRestore()
      await worker?.terminate()
    }
  })

  it('keeps the application owner lock when a database worker dies', async () => {
    const db = await open()
    const file = join(roots.at(-1)!, 'owner-lock')
    const owner = await acquireSqliteLock(file)
    const post = Worker.prototype.postMessage
    let stopped: Promise<number> | undefined
    const fault = vi.spyOn(Worker.prototype, 'postMessage').mockImplementation(function (
      this: Worker,
      message,
    ) {
      if (message.command?.sql === "SELECT 'stop-worker'") stopped = this.terminate()
      else post.call(this, message)
    })
    try {
      await expect(db.get("SELECT 'stop-worker'")).rejects.toThrow('sqlite worker exited')
      await stopped
      expect(db.isOpen).toBe(false)
      await expect(acquireSqliteLock(file)).rejects.toBeInstanceOf(SqliteLockBusy)
      await expect(db.close()).rejects.toThrow('sqlite worker exited')
      handles.splice(handles.indexOf(db), 1)
    } finally {
      fault.mockRestore()
      await owner.release()
    }
    const successor = await acquireSqliteLock(file)
    await successor.release()
  })

  it('keeps timers moving during expensive SQL, and drains it before close', async () => {
    const db = await open()
    let ticks = 0
    const timer = setInterval(() => {
      ticks += 1
    }, 5)
    try {
      const query = db.get(
        'WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000000) SELECT sum(x) AS total FROM n',
      )
      const close = db.close()
      expect(db.isOpen).toBe(true)
      await expect(query).resolves.toEqual({ total: 500000500000 })
      await close
      expect(ticks).toBeGreaterThan(5)
      expect(db.isOpen).toBe(false)
      await expect(db.get('SELECT 1')).rejects.toMatchObject({ code: 'ERR_INVALID_STATE' })
    } finally {
      clearInterval(timer)
    }
  })

  it('preserves integers, byte bindings, native errors, and automatic transaction state', async () => {
    const db = await open()
    await db.exec('CREATE TABLE item(id INTEGER PRIMARY KEY, body BLOB); BEGIN IMMEDIATE')
    await db.run('INSERT INTO item VALUES(?, ?)', [9007199254740993n, new Uint8Array([0, 255, 1])])
    expect(await db.get('SELECT CAST(id AS TEXT) AS id, body FROM item')).toEqual({
      id: '9007199254740993',
      body: new Uint8Array([0, 255, 1]),
    })
    await expect(db.get('SELECT id FROM item')).rejects.toMatchObject({ code: 'ERR_OUT_OF_RANGE' })
    await db.rollback()
    await db.rollback() // Actual engine autocommit state makes this a no-op.
    expect(await db.get('SELECT count(*) AS count FROM item')).toEqual({ count: 0 })
    await db.run('INSERT INTO item VALUES(1, NULL)')
    await expect(db.run('INSERT INTO item VALUES(1, NULL)')).rejects.toMatchObject({
      code: 'ERR_SQLITE_ERROR',
      errcode: 1555,
    })
  })

  it('refuses a cancelled native backup before creating its destination', async () => {
    const db = await open()
    const output = join(roots.at(-1)!, 'cancelled.sqlite')
    await db.exec('CREATE TABLE item(id INTEGER)')
    await expect(db.backup(output, { signal: AbortSignal.abort() })).rejects.toMatchObject({
      kind: 'cancelled',
    })
    await expect(stat(output)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await db.get('SELECT count(*) AS count FROM item')).toEqual({ count: 0 })
  })

  it('refuses a native backup whose page count exceeds capacity', async () => {
    const db = await open()
    const root = roots.at(-1)!
    await db.exec('CREATE TABLE payload(body BLOB); INSERT INTO payload VALUES(zeroblob(1048576))')
    const pageSize = (await db.get('PRAGMA page_size'))!.page_size as number
    await expect(
      db.backup(join(root, 'too-large.sqlite'), {
        limits: { pageSize, maxBytes: 16 * 1024, walFile: join(root, 'database.sqlite-wal') },
      }),
    ).rejects.toMatchObject({ kind: 'capacity' })
    expect(await db.get('SELECT length(body) AS size FROM payload')).toEqual({ size: 1048576 })
  })

  it('refuses a native backup when the observed WAL exceeds capacity', async () => {
    const db = await open()
    const root = roots.at(-1)!
    await db.exec('PRAGMA journal_mode=WAL; CREATE TABLE item(id INTEGER)')
    for (let id = 0; id < 40; id++) await db.run('INSERT INTO item VALUES(?)', [id])
    const walFile = join(root, 'database.sqlite-wal')
    expect((await stat(walFile)).size).toBeGreaterThan(32 * 1024)
    const pageSize = (await db.get('PRAGMA page_size'))!.page_size as number
    await expect(
      db.backup(join(root, 'wal-capacity.sqlite'), {
        limits: { pageSize, maxBytes: 32 * 1024, walFile },
      }),
    ).rejects.toMatchObject({ kind: 'capacity' })
    expect(await db.get('SELECT count(*) AS count FROM item')).toEqual({ count: 40 })
  })
})
