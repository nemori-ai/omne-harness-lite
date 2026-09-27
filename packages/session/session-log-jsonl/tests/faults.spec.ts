import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { openJsonlSessionLog, type JsonlSessionLog } from '../src/index.ts'
import { IoFailure } from '../src/file-io.ts'
import { openWithIo } from '../src/open.ts'
import {
  processOwnership,
  deferred,
  entry,
  interceptFiles,
  paths,
  root,
  session,
  unfenced,
  unconditional,
} from './support.ts'

const owners: JsonlSessionLog[] = []
const barriers: (() => void)[] = []
afterEach(async () => {
  for (const release of barriers.splice(0)) release()
  for (const owner of owners.splice(0)) await owner.close()
})
describe('actual file faults and retained execution ownership', () => {
  it('initialization failure closes all owned handles before releasing the acquired lock', async () => {
    const dir = await root()
    let handles = 0
    let rootChecks = 0
    const intercepted = interceptFiles((_path, file) => {
      handles++
      return {
        ...file,
        async close() {
          await file.close()
          handles--
        },
      }
    })
    const io = {
      ...intercepted,
      async identity(path: string) {
        if (path === dir && ++rootChecks === 2) throw new IoFailure('initialization-after-lock')
        return intercepted.identity(path)
      },
    }
    await expect(openWithIo({ processOwnership, dir }, io)).rejects.toThrow('initialization')
    expect(rootChecks).toBe(2)
    expect(handles).toBe(0)
    const next = await openJsonlSessionLog({ processOwnership, dir })
    owners.push(next)
  })
  it('a failed temporary index close remains owned and is retried during actual provider close', async () => {
    const dir = await root()
    let handles = 0
    let failed = false
    const io = interceptFiles((path, file) => {
      handles++
      return {
        ...file,
        async close() {
          if (path.endsWith('index.jsonl') && !failed) {
            failed = true
            throw new IoFailure('index-close')
          }
          await file.close()
          handles--
        },
      }
    })
    const log = await openWithIo({ processOwnership, dir }, io)
    owners.push(log)
    expect(await log.append(session(), [entry()], unfenced, unconditional)).toEqual({
      positions: [1],
      tail: 1,
    })
    expect(handles).toBe(3)
    await log.close()
    expect(handles).toBe(0)
    const next = await openJsonlSessionLog({ processOwnership, dir })
    owners.push(next)
  })
  it('internal defects propagate instead of becoming an unavailable result', async () => {
    const dir = await root()
    let fail = false
    const io = interceptFiles((path, file) =>
      !path.endsWith('entries.jsonl')
        ? file
        : {
            ...file,
            async read(offset, length) {
              if (fail) throw new TypeError('deliberate internal defect')
              return file.read(offset, length)
            },
          },
    )
    const log = await openWithIo({ processOwnership, dir }, io)
    owners.push(log)
    await log.append(session(), [entry()], unfenced, unconditional)
    fail = true
    await expect(log.readSince(session(), 0)).rejects.toThrow('deliberate internal defect')
  })
  it.each(['partial-write', 'datasync', 'first-directory-sync'])(
    'confirmed truncation restores future writes after %s',
    async stage => {
      const dir = await root()
      let failed = false
      let directorySyncs = 0
      let businessStarted = false
      const io = interceptFiles((path, file) => ({
        ...file,
        async write(bytes) {
          if (path === paths(dir).entries) businessStarted = true
          if (path === paths(dir).entries && stage === 'partial-write' && !failed) {
            failed = true
            return file.write(bytes.subarray(0, Math.floor(bytes.length / 2)))
          }
          return file.write(bytes)
        },
        async datasync() {
          if (path === paths(dir).entries && stage === 'datasync' && !failed) {
            failed = true
            throw new IoFailure('injected-datasync')
          }
          await file.datasync()
        },
        async sync() {
          if (path === paths(dir).directory && businessStarted) {
            directorySyncs++
            if (stage === 'first-directory-sync' && !failed) {
              failed = true
              throw new IoFailure('injected-directory-sync')
            }
          }
          await file.sync()
        },
      }))
      const log = await openWithIo({ processOwnership, dir }, io)
      owners.push(log)
      expect(await log.append(session(), [entry()], unfenced, unconditional)).toEqual({
        failure: 'unavailable',
      })
      expect((await readFile(paths(dir).entries)).length).toBe(0)
      expect(await log.readSince(session(), 0)).toEqual({ entries: [], tail: 0 })
      expect(await log.append(session(), [entry()], unfenced, unconditional)).toEqual({
        positions: [1],
        tail: 1,
      })
      if (stage === 'first-directory-sync') expect(directorySyncs).toBe(2)
    },
  )
  it('failed truncate makes all three operations unavailable and rejects queued jobs without IO', async () => {
    const dir = await root()
    const entered = deferred()
    const release = deferred()
    barriers.push(release.resolve)
    let writes = 0
    const io = interceptFiles((path, file) =>
      path !== paths(dir).entries
        ? file
        : {
            ...file,
            async write(bytes) {
              writes++
              const count = await file.write(bytes.subarray(0, Math.floor(bytes.length / 2)))
              entered.resolve()
              await release.promise
              return count
            },
            async truncate() {
              throw new IoFailure('injected-truncate')
            },
          },
    )
    const log = await openWithIo({ processOwnership, dir }, io)
    owners.push(log)
    const first = log.append(session(), [entry('first')], unfenced, unconditional)
    await entered.promise
    const queued = log.append(session(), [entry('queued')], unfenced, unconditional)
    release.resolve()
    expect(await first).toEqual({ failure: 'unavailable' })
    expect(await queued).toEqual({ failure: 'unavailable' })
    const actualBytes = await readFile(paths(dir).entries)
    for (const request of [
      log.readSince(session(), 0),
      log.readByKey(session(), 'absent'),
      log.append(session(), [entry('later')], unfenced, { kind: 'tailEquals', tail: 0 }),
    ])
      expect(await request).toEqual({ failure: 'unavailable' })
    expect(writes).toBe(1)
    expect(await readFile(paths(dir).entries)).toEqual(actualBytes)
    expect(await log.append(session('healthy-other'), [entry()], unfenced, unconditional)).toEqual({
      positions: [1],
      tail: 1,
    })
    // D085 actual exit recovery is covered separately in process.spec.ts.
  })
  it('a read with a real IO failure never returns a partial prefix', async () => {
    const dir = await root()
    let failReads = false
    let reads = 0
    const io = interceptFiles((path, file) =>
      path !== paths(dir).entries
        ? file
        : {
            ...file,
            async read(offset, length) {
              if (failReads && ++reads === 2) throw new IoFailure('injected-second-row-read')
              return file.read(offset, length)
            },
          },
    )
    const log = await openWithIo({ processOwnership, dir }, io)
    owners.push(log)
    await log.append(session(), [entry('first')], unfenced, unconditional)
    await log.append(session(), [entry('second')], unfenced, unconditional)
    failReads = true
    expect(await log.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
    failReads = false
    const read = await log.readSince(session(), 0)
    if ('failure' in read) throw new Error('read')
    expect(read.entries.map(item => item.position)).toEqual([1, 2])
  })
  it('an interleaved read returns entries and tail from the same immutable confirmed point', async () => {
    const dir = await root()
    const entered = deferred()
    const release = deferred()
    barriers.push(release.resolve)
    let blockReads = false
    const io = interceptFiles((path, file) =>
      path !== paths(dir).entries
        ? file
        : {
            ...file,
            async read(offset, length) {
              const bytes = await file.read(offset, length)
              if (blockReads) {
                entered.resolve()
                await release.promise
              }
              return bytes
            },
          },
    )
    const log = await openWithIo({ processOwnership, dir }, io)
    owners.push(log)
    await log.append(session(), [entry('first')], unfenced, unconditional)
    blockReads = true
    const reading = log.readSince(session(), 0)
    await entered.promise
    expect(await log.append(session(), [entry('second')], unfenced, unconditional)).toEqual({
      positions: [2],
      tail: 2,
    })
    release.resolve()
    const read = await reading
    if ('failure' in read) throw new Error('read')
    expect(read.tail).toBe(1)
    expect(read.entries.map(item => item.position)).toEqual([1])
  })
  it('close waits for actual read completion and retains physical ownership while waiting', async () => {
    const dir = await root()
    const entered = deferred()
    const release = deferred()
    barriers.push(release.resolve)
    let blockReads = false
    const io = interceptFiles((path, file) =>
      path !== paths(dir).entries
        ? file
        : {
            ...file,
            async read(offset, length) {
              const bytes = await file.read(offset, length)
              if (blockReads) {
                entered.resolve()
                await release.promise
              }
              return bytes
            },
          },
    )
    const log = await openWithIo({ processOwnership, dir }, io)
    owners.push(log)
    await log.append(session(), [entry()], unfenced, unconditional)
    blockReads = true
    const reading = log.readSince(session(), 0)
    await entered.promise
    let finished = false
    const closing = log.close().then(() => {
      finished = true
    })
    await expect(openJsonlSessionLog({ processOwnership, dir })).rejects.toThrow()
    expect(finished).toBe(false)
    expect(await log.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
    release.resolve()
    expect(await reading).toHaveProperty('tail', 1)
    await closing
    const next = await openJsonlSessionLog({ processOwnership, dir })
    owners.push(next)
    expect(await next.readSince(session(), 0)).toHaveProperty('tail', 1)
  })
  it('canceling an await keeps the real writer alive, and later conflict cannot negate unknown', async () => {
    const dir = await root()
    const entered = deferred()
    const release = deferred()
    barriers.push(release.resolve)
    const io = interceptFiles((path, file) =>
      path !== paths(dir).entries
        ? file
        : {
            ...file,
            async write(bytes) {
              const count = await file.write(bytes)
              entered.resolve()
              await release.promise
              return count
            },
          },
    )
    const log = await openWithIo({ processOwnership, dir }, io)
    owners.push(log)
    const original = log.append(session(), [entry('original')], unfenced, unconditional)
    await entered.promise
    expect(await Promise.race([original, Promise.resolve('caller-stopped-waiting')])).toBe(
      'caller-stopped-waiting',
    )
    expect(await log.readByKey(session(), 'original')).toEqual({ entries: [], tail: 0 })
    await expect(openJsonlSessionLog({ processOwnership, dir })).rejects.toThrow()
    const later = log.append(session(), [entry('later')], unfenced, { kind: 'tailEquals', tail: 0 })
    release.resolve()
    expect(await original).toEqual({ positions: [1], tail: 1 })
    expect(await later).toEqual({ failure: 'tailChanged', tail: 1 })
    const recovered = await log.readByKey(session(), 'original')
    if ('failure' in recovered) throw new Error('read')
    expect(recovered.entries[0]?.dedupeKey).toBe('original')
    expect(recovered.entries[0]?.position).toBe(1)
  })
  it('lost delivery after actual confirmation retains the complete original batch for recognition', async () => {
    const log = await openJsonlSessionLog({ processOwnership, dir: await root() })
    owners.push(log)
    const original = [
      entry('message', { text: 'original' }),
      entry('response', { amount: 'original' }),
    ]
    await expect(
      log.append(session(), original, unfenced, unconditional).then(() => {
        throw new IoFailure('delivery-lost')
      }),
    ).rejects.toThrow('delivery-lost')
    expect(
      await log.append(session(), [entry('later')], unfenced, { kind: 'tailEquals', tail: 0 }),
    ).toEqual({ failure: 'tailChanged', tail: 2 })
    const recognized = await log.readByKey(session(), 'read')
    if ('failure' in recognized) throw new Error('read')
    expect(recognized.entries.map(item => item.payload)).toEqual(original.map(item => item.payload))
    expect(recognized.entries.map(item => item.position)).toEqual([1, 2])
  })
  it('diagnostics contain only bounded stages, hashes and counts despite sensitive IO content', async () => {
    const dir = await root()
    const sentinel = 'secret-sentinel-payload-and-business-key'
    const events: unknown[] = []
    const io = interceptFiles((path, file) =>
      !path.endsWith('entries.jsonl')
        ? file
        : {
            ...file,
            async write() {
              throw new IoFailure(sentinel)
            },
          },
    )
    const log = await openWithIo(
      { processOwnership, dir, diagnostic: event => events.push(event) },
      io,
    )
    owners.push(log)
    expect(
      await log.append(
        session(sentinel),
        [entry(sentinel, { rawHeaders: sentinel, secret: sentinel })],
        unfenced,
        unconditional,
      ),
    ).toEqual({ failure: 'unavailable' })
    const serialized = JSON.stringify(events)
    expect(events.length).toBeGreaterThan(0)
    expect(serialized).not.toContain(sentinel)
    expect(serialized).not.toContain(dir)
    expect(serialized).not.toContain('rawHeaders')
    expect(serialized.length).toBeLessThan(512)
  })
})
