import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import {
  openJsonlSessionLog,
  type JsonlSessionLog,
  type SessionLogDiagnostic,
} from '../src/index.ts'
import { IoFailure } from '../src/file-io.ts'
import { openWithIo } from '../src/open.ts'
import { sessionLogJsonl } from '../src/plugin.ts'
import {
  deferred,
  entry,
  interceptFiles,
  paths,
  processOwnership,
  root,
  session,
  unconditional,
  unfenced,
} from './support.ts'

const owners: JsonlSessionLog[] = []
const barriers: (() => void)[] = []
const disposers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const release of barriers.splice(0)) release()
  for (const dispose of disposers.splice(0)) await dispose()
  for (const owner of owners.splice(0)) await owner.close()
})
function failingSink(events: SessionLogDiagnostic[]): (event: SessionLogDiagnostic) => void {
  return event => {
    events.push(event)
    throw new Error('borrowed-diagnostic-sentinel')
  }
}
describe('borrowed synchronous diagnostic boundary', () => {
  it.each(['normal', 'throwing'])(
    '%s sink cannot alter first append, complete reads, clean marker or actual lock release',
    async mode => {
      const dir = await root()
      const events: SessionLogDiagnostic[] = []
      let handles = 0
      const io = interceptFiles((_path, file) => {
        handles++
        return {
          ...file,
          async close() {
            await file.close()
            handles--
          },
        }
      })
      const log = await openWithIo(
        {
          dir,
          processOwnership,
          diagnostic:
            mode === 'throwing'
              ? failingSink(events)
              : event => {
                  events.push(event)
                },
        },
        io,
      )
      owners.push(log)
      const payload = { original: true, nested: ['one', { value: 3 }] }
      expect(
        await log.append(session(), [entry('stable', payload)], unfenced, unconditional),
      ).toEqual({ positions: [1], tail: 1 })
      const read = await log.readSince(session(), 0)
      if ('failure' in read) throw new Error('healthy read failed')
      expect(read.tail).toBe(1)
      expect(read.entries[0]?.payload).toEqual(payload)
      expect(await log.readByKey(session(), 'stable')).toEqual(read)
      await log.close()
      expect(handles).toBe(0)
      expect(
        JSON.parse(await readFile(join(paths(dir).directory, 'recovery.json'), 'utf8')),
      ).toEqual({ v: 1, state: 'clean' })
      expect(
        events.some(event => event.operation === 'markClean' && event.outcome === 'completed'),
      ).toBe(true)
      const next = await openJsonlSessionLog({ dir, processOwnership })
      owners.push(next)
      expect(await next.readSince(session(), 0)).toEqual(read)
    },
  )
  it('normally written and closed full history reopens with a throwing recovery sink', async () => {
    const dir = await root()
    const first = await openJsonlSessionLog({ dir, processOwnership })
    owners.push(first)
    const payload = { original: true, array: [null, false, { number: 17 }] }
    await first.append(session(), [entry('stable', payload)], unfenced, unconditional)
    await first.close()
    const events: SessionLogDiagnostic[] = []
    const next = await openJsonlSessionLog({
      dir,
      processOwnership,
      diagnostic: failingSink(events),
    })
    owners.push(next)
    const read = await next.readSince(session(), 0)
    if ('failure' in read) throw new Error('healthy history unavailable')
    expect(read.tail).toBe(1)
    expect(read.entries).toHaveLength(1)
    expect(read.entries[0]?.payload).toEqual(payload)
    expect(await next.readByKey(session(), 'stable')).toEqual(read)
    expect(await next.append(session(), [entry('stable')], unfenced, unconditional)).toEqual({
      failure: 'alreadyRecorded',
      keys: ['stable'],
    })
    expect(events.some(event => event.recoverySource === 'clean')).toBe(true)
  })
  it('index warning cannot negate the already confirmed append or prevent durable close', async () => {
    const dir = await root()
    const events: SessionLogDiagnostic[] = []
    let failed = false
    const io = interceptFiles((path, file) => ({
      ...file,
      async write(bytes) {
        if (path === paths(dir).index && !failed) {
          failed = true
          throw new IoFailure('index-test')
        }
        return file.write(bytes)
      },
    }))
    const log = await openWithIo({ dir, processOwnership, diagnostic: failingSink(events) }, io)
    owners.push(log)
    expect(await log.append(session(), [entry()], unfenced, unconditional)).toEqual({
      positions: [1],
      tail: 1,
    })
    expect(await log.readSince(session(), 0)).toHaveProperty('tail', 1)
    await log.close()
    expect(events.some(event => event.stage === 'index')).toBe(true)
    const next = await openJsonlSessionLog({ dir, processOwnership })
    owners.push(next)
    expect(await next.append(session(), [entry()], unfenced, unconditional)).toEqual({
      failure: 'alreadyRecorded',
      keys: ['key'],
    })
  })
  it.each([false, true])(
    'partial-write with failed rollback=%s retains the real health decision despite throwing sink',
    async failedRollback => {
      const dir = await root()
      const events: SessionLogDiagnostic[] = []
      let failedWrite = false
      const io = interceptFiles((path, file) => ({
        ...file,
        async write(bytes) {
          if (path === paths(dir).entries && !failedWrite) {
            failedWrite = true
            return file.write(bytes.subarray(0, Math.floor(bytes.length / 2)))
          }
          return file.write(bytes)
        },
        async truncate(size) {
          if (path === paths(dir).entries && failedRollback) throw new IoFailure('rollback-test')
          await file.truncate(size)
        },
      }))
      const log = await openWithIo({ dir, processOwnership, diagnostic: failingSink(events) }, io)
      owners.push(log)
      expect(await log.append(session(), [entry()], unfenced, unconditional)).toEqual({
        failure: 'unavailable',
      })
      expect(events.some(event => event.stage === 'append')).toBe(true)
      if (failedRollback) {
        expect(await log.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
        expect(await log.readByKey(session(), 'key')).toEqual({ failure: 'unavailable' })
        expect(await log.append(session(), [entry()], unfenced, unconditional)).toEqual({
          failure: 'unavailable',
        })
        expect(events.some(event => event.stage === 'repair')).toBe(true)
      } else {
        expect(await log.readSince(session(), 0)).toEqual({ entries: [], tail: 0 })
        expect(await log.append(session(), [entry()], unfenced, unconditional)).toEqual({
          positions: [1],
          tail: 1,
        })
      }
    },
  )
  it('root replacement stays unavailable and never publishes a false empty history', async () => {
    const dir = await root()
    const events: SessionLogDiagnostic[] = []
    const log = await openJsonlSessionLog({
      dir,
      processOwnership,
      diagnostic: failingSink(events),
    })
    owners.push(log)
    await log.append(session(), [entry()], unfenced, unconditional)
    await rename(dir, dir + '-original')
    await mkdir(dir)
    expect(await log.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
    expect(await log.append(session(), [entry('new')], unfenced, unconditional)).toEqual({
      failure: 'unavailable',
    })
    expect(events.some(event => event.stage === 'root')).toBe(true)
  })
  it('busy residency diagnostic preserves the actual running task and zero new-log IO', async () => {
    const dir = await root()
    const events: SessionLogDiagnostic[] = []
    const entered = deferred()
    const release = deferred()
    barriers.push(release.resolve)
    const io = interceptFiles((path, file) => ({
      ...file,
      async write(bytes) {
        const done = await file.write(bytes)
        if (path === paths(dir).entries) {
          entered.resolve()
          await release.promise
        }
        return done
      },
    }))
    const log = await openWithIo(
      { dir, processOwnership, policy: { residentLogsLimit: 1 }, diagnostic: failingSink(events) },
      io,
    )
    owners.push(log)
    const original = log.append(session(), [entry()], unfenced, unconditional)
    await entered.promise
    expect(await log.readSince(session('other'), 0)).toEqual({ failure: 'unavailable' })
    await expect(readFile(paths(dir, 'other').entries)).rejects.toHaveProperty('code', 'ENOENT')
    expect(events.some(event => event.stage === 'capacity')).toBe(true)
    release.resolve()
    expect(await original).toEqual({ positions: [1], tail: 1 })
  })
  it('tail repair completes physically before history publication despite throwing sink', async () => {
    const dir = await root()
    const first = await openJsonlSessionLog({ dir, processOwnership })
    owners.push(first)
    await first.append(session(), [entry()], unfenced, unconditional)
    await first.close()
    const bytes = await readFile(paths(dir).entries)
    await writeFile(paths(dir).entries, Buffer.concat([bytes, Buffer.from('{"v":')]))
    const events: SessionLogDiagnostic[] = []
    const next = await openJsonlSessionLog({
      dir,
      processOwnership,
      diagnostic: failingSink(events),
    })
    owners.push(next)
    expect(await next.readSince(session(), 0)).toHaveProperty('tail', 1)
    expect(await readFile(paths(dir).entries)).toEqual(bytes)
    expect(
      events.some(event => event.operation === 'tailRepair' && event.outcome === 'completed'),
    ).toBe(true)
  })
  it.each(['io', 'defect'])(
    'real close %s failure survives the throwing diagnostic and keeps ownership',
    async kind => {
      const dir = await root()
      const events: SessionLogDiagnostic[] = []
      const defect = new TypeError('actual-internal-close-defect')
      let failClose = false
      let handles = 0
      const io = interceptFiles((path, file) => {
        handles++
        return {
          ...file,
          async close() {
            if (path === paths(dir).entries && failClose) {
              if (kind === 'defect') throw defect
              throw new IoFailure('actual-file-close-test')
            }
            await file.close()
            handles--
          },
        }
      })
      const log = await openWithIo({ dir, processOwnership, diagnostic: failingSink(events) }, io)
      await log.append(session(), [entry()], unfenced, unconditional)
      failClose = true
      if (kind === 'defect') await expect(log.close()).rejects.toBe(defect)
      else
        await expect(log.close()).rejects.toMatchObject({
          stage: 'close',
          message: 'session log IO failed at close',
        })
      expect(handles).toBeGreaterThan(0)
      expect(events.some(event => event.stage === 'close' && event.outcome === 'failed')).toBe(true)
      await expect(openJsonlSessionLog({ dir, processOwnership })).rejects.toThrow('initialization')
      // This failed owner remains pinned until the actual Vitest worker process exits.
      // Retrying close cannot invent completion or transfer ownership.
      await expect(log.close()).rejects.toThrow()
    },
  )
  it('internal read defects are not absorbed by the borrowed diagnostic boundary', async () => {
    const dir = await root()
    const defect = new TypeError('actual-internal-read-defect')
    let failRead = false
    const io = interceptFiles((path, file) => ({
      ...file,
      async read(offset, length) {
        if (path === paths(dir).entries && failRead) throw defect
        return file.read(offset, length)
      },
    }))
    const log = await openWithIo({ dir, processOwnership, diagnostic: failingSink([]) }, io)
    owners.push(log)
    await log.append(session(), [entry()], unfenced, unconditional)
    failRead = true
    await expect(log.readSince(session(), 0)).rejects.toBe(defect)
  })
  it('real Cordis disposal with a throwing sink closes the same owner before lock transfer', async () => {
    const dir = await root()
    const events: SessionLogDiagnostic[] = []
    const ctx = new Context()
    const fiber = await ctx.plugin(sessionLogJsonl, {
      dir,
      processOwnership,
      diagnostic: failingSink(events),
    })
    disposers.push(() => fiber.dispose())
    const service = ctx.get('sessionLog')
    if (service === undefined) throw new Error('service missing')
    expect(await service.append(session(), [entry()], unfenced, unconditional)).toEqual({
      positions: [1],
      tail: 1,
    })
    await fiber.dispose()
    expect(ctx.get('sessionLog')).toBeUndefined()
    expect(events.some(event => event.operation === 'markClean')).toBe(true)
    const next = await openJsonlSessionLog({ dir, processOwnership })
    owners.push(next)
    expect(await next.readSince(session(), 0)).toHaveProperty('tail', 1)
  })
})
