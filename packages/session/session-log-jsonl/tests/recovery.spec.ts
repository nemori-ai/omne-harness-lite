import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openJsonlSessionLog, type JsonlSessionLog } from '../src/index.ts'
import { openWithIo } from '../src/open.ts'
import { fileIo, IoFailure, type FileIo } from '../src/file-io.ts'
import { decodeRecoveryMarker } from '../src/recovery.ts'
import {
  processOwnership,
  root,
  session,
  entry,
  unfenced,
  unconditional,
  paths,
  deferred,
} from './support.ts'

const owners: JsonlSessionLog[] = []
const barriers: (() => void)[] = []
afterEach(async () => {
  for (const release of barriers.splice(0)) release()
  for (const owner of owners.splice(0)) await owner.close()
})
async function own(dir: string, io: FileIo = fileIo): Promise<JsonlSessionLog> {
  const result = await openWithIo({ dir, processOwnership }, io)
  owners.push(result)
  return result
}
async function seed(dir: string): Promise<void> {
  const log = await own(dir)
  await log.append(session(), [entry('first')], unfenced, unconditional)
  await log.append(session(), [entry('second')], unfenced, unconditional)
  await log.close()
}
async function marker(dir: string): Promise<unknown> {
  return decodeRecoveryMarker(await readFile(join(paths(dir).directory, 'recovery.json')))
}
describe('D085 strict recovery gate and physical lifecycle', () => {
  it.each([
    undefined,
    null,
    {},
    { current: '', observeExit() {} },
    { current: 'x', observeExit: 3 },
    { current: 'x', observeExit() {}, extra: true },
    { current: 'x', observeExit() {}, observeLegacyExit: 3 },
  ])('missing or malformed physical port fails synchronously with zero provider IO: %j', value => {
    let ioCalls = 0
    const dir = '/unused-missing-ownership'
    const spy = vi.spyOn(fileIo, 'mkdir').mockImplementation(async () => {
      ioCalls++
      throw new IoFailure('unexpected-configuration-IO')
    })
    try {
      expect(() =>
        Reflect.apply(openJsonlSessionLog, undefined, [{ dir, processOwnership: value }]),
      ).toThrow('process ownership')
      expect(ioCalls).toBe(0)
    } finally {
      spy.mockRestore()
    }
  })
  it('clean retains the index path: actual initialization reads only its final row, then suffix', async () => {
    const dir = await root()
    await seed(dir)
    expect(await marker(dir)).toEqual({ v: 1, state: 'clean' })
    const offsets: number[] = []
    const io = {
      ...fileIo,
      async open(path: string, flags: Parameters<FileIo['open']>[1]) {
        const file = await fileIo.open(path, flags)
        return path === paths(dir).entries
          ? {
              ...file,
              async read(offset: number, length: number) {
                offsets.push(offset)
                return file.read(offset, length)
              },
            }
          : file
      },
    }
    const next = await own(dir, io)
    expect(await next.append(session(), [entry('first')], unfenced, unconditional)).toHaveProperty(
      'failure',
      'alreadyRecorded',
    )
    expect(offsets.length).toBe(2)
    expect(offsets[0]).toBeGreaterThan(0)
    expect(offsets[1]).toBe((await readFile(paths(dir).entries)).length)
    expect(await marker(dir)).toEqual({ v: 1, state: 'active', owner: processOwnership.current })
    await next.close()
    expect(await marker(dir)).toEqual({ v: 1, state: 'clean' })
  })
  it.each(['open', 'write', 'datasync', 'close', 'rename', 'sync'])(
    'active %s fault occurs before any business file mutation',
    async stage => {
      const dir = await root()
      await seed(dir)
      const before = await readFile(paths(dir).entries)
      const beforeIndex = await readFile(paths(dir).index)
      let failed = false
      const fault = () => {
        if (!failed) {
          failed = true
          throw new IoFailure(`active-${stage}`)
        }
      }
      const io: FileIo = {
        ...fileIo,
        async rename(from, to) {
          if (stage === 'rename' && to.endsWith('recovery.json')) fault()
          await fileIo.rename(from, to)
        },
        async open(path, flags) {
          if (stage === 'open' && path.endsWith('recovery.json.next')) fault()
          const file = await fileIo.open(path, flags)
          if (path.endsWith('recovery.json.next'))
            return {
              ...file,
              async write(bytes) {
                if (stage === 'write') fault()
                return file.write(bytes)
              },
              async datasync() {
                if (stage === 'datasync') fault()
                await file.datasync()
              },
              async close() {
                if (stage === 'close') fault()
                await file.close()
              },
            }
          if (path === paths(dir).directory)
            return {
              ...file,
              async sync() {
                if (stage === 'sync') fault()
                await file.sync()
              },
            }
          return file
        },
      }
      const log = await own(dir, io)
      expect(await log.append(session(), [entry('later')], unfenced, unconditional)).toEqual({
        failure: 'unavailable',
      })
      expect(await log.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
      expect(failed).toBe(true)
      expect(await readFile(paths(dir).entries)).toEqual(before)
      expect(await readFile(paths(dir).index)).toEqual(beforeIndex)
      await log.close()
    },
  )
  it.each(['open', 'write', 'datasync', 'close', 'rename', 'sync'])(
    'clean %s fault fails close and retains the real root lock',
    async stage => {
      const dir = await root()
      let closing = false
      let failed = false
      let cleanWritten = false
      const fault = () => {
        if (closing && !failed) {
          failed = true
          throw new IoFailure(`clean-${stage}`)
        }
      }
      const io: FileIo = {
        ...fileIo,
        async rename(from, to) {
          if (stage === 'rename' && to.endsWith('recovery.json')) fault()
          await fileIo.rename(from, to)
        },
        async open(path, flags) {
          if (stage === 'open' && path.endsWith('recovery.json.next')) fault()
          const file = await fileIo.open(path, flags)
          if (path.endsWith('recovery.json.next'))
            return {
              ...file,
              async write(bytes) {
                if (stage === 'write') fault()
                if (closing) cleanWritten = true
                return file.write(bytes)
              },
              async datasync() {
                if (stage === 'datasync') fault()
                await file.datasync()
              },
              async close() {
                if (stage === 'close') fault()
                await file.close()
              },
            }
          if (path === paths(dir).directory)
            return {
              ...file,
              async sync() {
                if (stage === 'sync' && cleanWritten) fault()
                await file.sync()
              },
            }
          return file
        },
      }
      const log = await openWithIo({ dir, processOwnership }, io)
      await log.append(session(), [entry()], unfenced, unconditional)
      const bytes = await readFile(paths(dir).entries)
      closing = true
      await expect(log.close()).rejects.toThrow('close')
      expect(failed).toBe(true)
      await expect(openJsonlSessionLog({ dir, processOwnership })).rejects.toThrow()
      expect(await readFile(paths(dir).entries)).toEqual(bytes)
      // Deliberate failed-close owner is pinned until this real Vitest process exits.
    },
  )
  it.each(['current', 'alive', 'unknown', 'throw', 'invalid'])(
    'active owner %s is unavailable without modifying bytes or invoking legacy',
    async state => {
      const dir = await root()
      await seed(dir)
      const owner = state === 'current' ? processOwnership.current : 'unobserved-historical-owner'
      const bytes = Buffer.from(JSON.stringify({ v: 1, state: 'active', owner }))
      await writeFile(join(paths(dir).directory, 'recovery.json'), bytes)
      let observed = 0
      let legacy = 0
      const ownership = {
        current: processOwnership.current,
        async observeExit() {
          observed++
          if (state === 'throw') throw new Error('secret observer error')
          return state === 'alive' ? 'alive' : state === 'invalid' ? 'bogus' : 'unknown'
        },
        async observeLegacyExit() {
          legacy++
          return 'exited'
        },
      }
      const log: JsonlSessionLog = await Reflect.apply(openJsonlSessionLog, undefined, [
        { dir, processOwnership: ownership },
      ])
      owners.push(log)
      expect(await log.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
      expect(await log.readByKey(session(), 'first')).toEqual({ failure: 'unavailable' })
      expect(await log.append(session(), [entry('third')], unfenced, unconditional)).toEqual({
        failure: 'unavailable',
      })
      expect(observed).toBe(state === 'current' ? 0 : 1)
      expect(legacy).toBe(0)
      await log.close()
      expect(await readFile(join(paths(dir).directory, 'recovery.json'))).toEqual(bytes)
    },
  )
  it('same-process untrusted close and LRU eviction cannot be bypassed by a lying observer', async () => {
    const dir = await root()
    const io: FileIo = {
      ...fileIo,
      async open(path, flags) {
        const file = await fileIo.open(path, flags)
        return path === paths(dir).entries
          ? {
              ...file,
              async write(bytes) {
                return file.write(bytes.subarray(0, Math.floor(bytes.length / 2)))
              },
              async truncate() {
                throw new IoFailure('no-rollback')
              },
            }
          : file
      },
    }
    const log = await openWithIo({ dir, processOwnership, policy: { residentLogsLimit: 1 } }, io)
    owners.push(log)
    expect(await log.append(session(), [entry()], unfenced, unconditional)).toEqual({
      failure: 'unavailable',
    })
    expect(
      await log.append(session('other'), [entry('other')], unfenced, unconditional),
    ).toHaveProperty('tail', 1)
    expect(await log.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
    await log.close()
    let observed = 0
    const next = await openJsonlSessionLog({
      dir,
      processOwnership: {
        current: processOwnership.current,
        async observeExit() {
          observed++
          return 'exited'
        },
      },
    })
    owners.push(next)
    expect(await next.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
    expect(observed).toBe(0)
    expect(await marker(dir)).toEqual({ v: 1, state: 'active', owner: processOwnership.current })
  })
  it.each(['bad-json', 'duplicate', 'extra', 'version', 'empty-owner'])(
    'damaged formal marker %s is not legacy and cannot be erased',
    async kind => {
      const dir = await root()
      await seed(dir)
      const texts: Readonly<Record<string, string>> = {
        'bad-json': '{',
        duplicate: '{"v":1,"state":"clean","state":"clean"}',
        extra: '{"v":1,"state":"clean","extra":1}',
        version: '{"v":2,"state":"clean"}',
        'empty-owner': '{"v":1,"state":"active","owner":""}',
      }
      const text = texts[kind]
      if (text === undefined) throw new Error('unknown fixture')
      const path = join(paths(dir).directory, 'recovery.json')
      await writeFile(path, text)
      let legacy = 0
      const log = await openJsonlSessionLog({
        dir,
        processOwnership: {
          ...processOwnership,
          async observeLegacyExit() {
            legacy++
            return 'exited'
          },
        },
      })
      owners.push(log)
      expect(await log.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
      await log.close()
      expect(legacy).toBe(0)
      expect(await readFile(path, 'utf8')).toBe(text)
    },
  )
  it.each(['{"v":1,"state":"active","owner":"fake"}', '{half', ''])(
    'stale next is never authority and is removed only after formal clean gate: %s',
    async next => {
      const dir = await root()
      await seed(dir)
      await writeFile(join(paths(dir).directory, 'recovery.json.next'), next)
      const log = await own(dir)
      expect(await log.readSince(session(), 0)).toHaveProperty('tail', 2)
      expect(await readdir(paths(dir).directory)).not.toContain('recovery.json.next')
    },
  )
  it('stale-next cleanup failure stops opening before business file IO', async () => {
    const dir = await root()
    await seed(dir)
    await writeFile(join(paths(dir).directory, 'recovery.json.next'), '{partial')
    let businessOpens = 0
    const io: FileIo = {
      ...fileIo,
      async unlink(path) {
        if (path.endsWith('recovery.json.next')) throw new IoFailure('cleanup-next')
        await fileIo.unlink(path)
      },
      async open(path, flags) {
        if (path.endsWith('entries.jsonl')) businessOpens++
        return fileIo.open(path, flags)
      },
    }
    const log = await own(dir, io)
    expect(await log.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
    expect(businessOpens).toBe(0)
  })
  it('pending owner observation belongs to close and leaves the untouched active unchanged', async () => {
    const dir = await root()
    await seed(dir)
    const text = '{"v":1,"state":"active","owner":"unknown-history"}'
    await writeFile(join(paths(dir).directory, 'recovery.json'), text)
    const entered = deferred()
    const release = deferred()
    barriers.push(release.resolve)
    const log = await openJsonlSessionLog({
      dir,
      processOwnership: {
        ...processOwnership,
        async observeExit() {
          entered.resolve()
          await release.promise
          return 'unknown'
        },
      },
    })
    owners.push(log)
    const read = log.readSince(session(), 0)
    await entered.promise
    let stopped = false
    const closing = log.close().then(() => {
      stopped = true
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(stopped).toBe(false)
    await expect(openJsonlSessionLog({ dir, processOwnership })).rejects.toThrow()
    release.resolve()
    expect(await read).toEqual({ failure: 'unavailable' })
    await closing
    expect(await readFile(join(paths(dir).directory, 'recovery.json'), 'utf8')).toBe(text)
  })
  it('untouched active logs are not cleaned by another resident or root close', async () => {
    const dir = await root()
    const other = paths(dir, 'untouched').directory
    await mkdir(other)
    const text = '{"v":1,"state":"active","owner":"historic"}'
    await writeFile(join(other, 'recovery.json'), text)
    const log = await own(dir)
    await log.append(session(), [entry()], unfenced, unconditional)
    await log.close()
    expect(await readFile(join(other, 'recovery.json'), 'utf8')).toBe(text)
  })
  it('new-directory parent sync failure creates no marker or business files', async () => {
    const dir = await root()
    let preparing = false
    const io: FileIo = {
      ...fileIo,
      async mkdir(path) {
        const result = await fileIo.mkdir(path)
        if (path === paths(dir).directory) preparing = true
        return result
      },
      async open(path, flags) {
        const file = await fileIo.open(path, flags)
        return path === dir
          ? {
              ...file,
              async sync() {
                if (preparing) throw new IoFailure('parent-dirsync')
                await file.sync()
              },
            }
          : file
      },
    }
    const log = await own(dir, io)
    expect(await log.append(session(), [entry()], unfenced, unconditional)).toEqual({
      failure: 'unavailable',
    })
    expect(await readdir(paths(dir).directory)).toEqual([])
    expect(await log.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
  })
  it('first-use active marker task remains owned by close until its real directory sync ends', async () => {
    const dir = await root()
    const entered = deferred()
    const release = deferred()
    barriers.push(release.resolve)
    const io: FileIo = {
      ...fileIo,
      async open(path, flags) {
        const file = await fileIo.open(path, flags)
        return path === paths(dir).directory
          ? {
              ...file,
              async sync() {
                entered.resolve()
                await release.promise
                await file.sync()
              },
            }
          : file
      },
    }
    const log = await own(dir, io)
    const append = log.append(session(), [entry()], unfenced, unconditional)
    await entered.promise
    let stopped = false
    const closing = log.close().then(() => {
      stopped = true
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(stopped).toBe(false)
    expect(await readdir(paths(dir).directory)).toEqual(['recovery.json'])
    await expect(openJsonlSessionLog({ dir, processOwnership })).rejects.toThrow()
    release.resolve()
    expect(await append).toHaveProperty('tail', 1)
    await closing
    expect(await marker(dir)).toEqual({ v: 1, state: 'clean' })
  })
  it('missing entries with an existing index cannot be mistaken for an empty log', async () => {
    const dir = await root()
    await seed(dir)
    await fileIo.unlink(paths(dir).entries)
    const index = await readFile(paths(dir).index)
    const log = await own(dir)
    expect(await log.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
    expect(await log.append(session(), [entry('replacement')], unfenced, unconditional)).toEqual({
      failure: 'unavailable',
    })
    expect(await readFile(paths(dir).index)).toEqual(index)
  })
  it('captures the physical current once and emits bounded scan/repair/close causes', async () => {
    const dir = await root()
    await seed(dir)
    await writeFile(paths(dir).index, 'invalid\n')
    const events: import('../src/index.ts').SessionLogDiagnostic[] = []
    const source = { ...processOwnership }
    const log = await openJsonlSessionLog({
      dir,
      processOwnership: source,
      diagnostic: event => events.push(event),
    })
    owners.push(log)
    source.current = 'mutated-caller-input'
    expect(await log.readSince(session(), 0)).toHaveProperty('tail', 2)
    expect(await marker(dir)).toEqual({ v: 1, state: 'active', owner: processOwnership.current })
    expect(events).toContainEqual({
      level: 'warn',
      stage: 'recovery',
      sessionHash: paths(dir).directory.split('/').pop(),
      operation: 'fullScan',
      count: 2,
      outcome: 'completed',
    })
    await log.close()
    expect(events).toContainEqual({
      level: 'warn',
      stage: 'close',
      sessionHash: paths(dir).directory.split('/').pop(),
      operation: 'markClean',
      outcome: 'completed',
    })
    expect(JSON.stringify(events)).not.toContain(dir)
    expect(JSON.stringify(events)).not.toContain(processOwnership.current)
  })
})
