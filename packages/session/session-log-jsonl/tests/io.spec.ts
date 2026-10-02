import { readFile, readdir, rename, mkdir, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  toOpaqueJson,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { isOk, parseTenantId } from '@omne-harness-lite/identity-values'
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
  tenant,
  unfenced,
  unconditional,
} from './support.ts'

const owners: JsonlSessionLog[] = []
const barriers: (() => void)[] = []
async function owned(
  dir: string,
  options: Parameters<typeof openJsonlSessionLog>[0] = { processOwnership, dir },
): Promise<JsonlSessionLog> {
  const log = await openJsonlSessionLog(options)
  owners.push(log)
  return log
}
afterEach(async () => {
  for (const release of barriers.splice(0)) release()
  for (const owner of owners.splice(0)) await owner.close()
})

describe('real JSONL submission and opaque snapshots', () => {
  it('S30 three batches retain positions 1, 2–3, 4 and selected read positions 2, 4', async () => {
    const log = await owned(await root())
    expect(
      await log.append(session(), [{ ...entry('one'), readKeys: [] }], unfenced, unconditional),
    ).toEqual({ positions: [1], tail: 1 })
    expect(
      await log.append(
        session(),
        [
          { ...entry('two'), readKeys: ['selected'] },
          { ...entry('three'), readKeys: [] },
        ],
        unfenced,
        unconditional,
      ),
    ).toEqual({ positions: [2, 3], tail: 3 })
    expect(
      await log.append(
        session(),
        [{ ...entry('four'), readKeys: ['selected'] }],
        unfenced,
        unconditional,
      ),
    ).toEqual({ positions: [4], tail: 4 })
    const cases: readonly { readonly after: number; readonly positions: readonly number[] }[] = [
      { after: 0, positions: [1, 2, 3, 4] },
      { after: 2, positions: [3, 4] },
      { after: 9, positions: [] },
    ]
    for (const { after, positions } of cases) {
      const read = await log.readSince(session(), after)
      if ('failure' in read) throw new Error('read')
      expect(read.tail).toBe(4)
      expect(read.entries.map(item => item.position)).toEqual(positions)
    }
    const keyed = await log.readByKey(session(), 'selected')
    if ('failure' in keyed) throw new Error('read')
    expect(keyed.tail).toBe(4)
    expect(keyed.entries.map(item => item.position)).toEqual([2, 4])
  })
  it('S27 actual competing fenced attempts never place attempt 1 after attempt 2; unfenced late data can follow', async () => {
    for (const order of [
      [1, 2],
      [2, 1],
    ]) {
      const log = await owned(await root())
      await log.append(
        session(),
        [{ ...entry('start'), run: 'run', attempt: 1 }],
        { kind: 'fenced', run: 'run', attempt: 1 },
        unconditional,
      )
      const results = await Promise.all(
        order.map(attempt =>
          log.append(
            session(),
            [{ ...entry(`attempt-${attempt}`), run: 'run', attempt }],
            { kind: 'fenced', run: 'run', attempt },
            unconditional,
          ),
        ),
      )
      expect(results.filter(item => 'positions' in item).length).toBeGreaterThanOrEqual(1)
      const read = await log.readSince(session(), 0)
      if ('failure' in read) throw new Error('read')
      let newerSeen = false
      for (const item of read.entries) {
        if (item.attempt === 2) newerSeen = true
        if (newerSeen) expect(item.attempt).toBe(2)
      }
      expect(newerSeen).toBe(true)
      expect(
        await log.append(
          session(),
          [{ ...entry('late-response', { late: true }), run: 'run', attempt: 1 }],
          unfenced,
          unconditional,
        ),
      ).toHaveProperty('positions')
    }
  })
  it('never creates session files for reads, invalid input or a future-tail rejection', async () => {
    const dir = await root()
    const log = await owned(dir)
    expect(await log.readSince(session(), 0)).toEqual({ entries: [], tail: 0 })
    expect(await log.readByKey(session(), 'absent')).toEqual({ entries: [], tail: 0 })
    expect(
      await log.append(session(), [entry()], unfenced, {
        kind: 'tailEquals',
        tail: new LosslessNumber('9007199254740993'),
      }),
    ).toEqual({ failure: 'tailChanged', tail: 0 })
    // Runtime boundary rejects old three arguments even when a caller bypasses TS.
    expect(await Reflect.apply(log.append, undefined, [session(), [entry()], unfenced])).toEqual({
      failure: 'invalidInput',
    })
    expect((await readdir(dir)).filter(name => !name.startsWith('.owner-lock'))).toEqual([])
    const parsed = parseTenantId({ organization: 'another', account: 'account' })
    if (!isOk(parsed)) throw new Error('fixture')
    expect(
      await log.append(session(), [{ ...entry(), tenant: parsed.ok }], unfenced, unconditional),
    ).toEqual({ positions: [1], tail: 1 })
  })
  it('commits one whole line per batch and survives healthy close/reopen at original positions', async () => {
    const dir = await root()
    const log = await owned(dir)
    expect(
      await log.append(session(), [entry('one'), entry('two')], unfenced, unconditional),
    ).toEqual({ positions: [1, 2], tail: 2 })
    const bytes = await readFile(paths(dir).entries, 'utf8')
    expect(bytes.trim().split('\n')).toHaveLength(1)
    expect(bytes).toContain('"first":1')
    expect(bytes).not.toContain('position')
    const original = await log.readSince(session(), 0)
    await log.close()
    const next = await owned(dir)
    expect(writeJsonLossless(await next.readSince(session(), 0))).toBe(writeJsonLossless(original))
    expect(
      await next.append(session(), [entry('two')], unfenced, { kind: 'tailEquals', tail: 0 }),
    ).toEqual({ failure: 'alreadyRecorded', keys: ['two'] })
  })
  it('serializes same-tail callers and all shell decisions through actual durable write', async () => {
    const dir = await root()
    const log = await owned(dir)
    const results = await Promise.all([
      log.append(session(), [entry('a')], unfenced, { kind: 'tailEquals', tail: 0 }),
      log.append(session(), [entry('b')], unfenced, { kind: 'tailEquals', tail: 0 }),
    ])
    expect(results.filter(result => 'positions' in result)).toHaveLength(1)
    expect(results.filter(result => 'failure' in result)).toEqual([
      { failure: 'tailChanged', tail: 1 },
    ])
    expect((await readFile(paths(dir).entries, 'utf8')).trim().split('\n')).toHaveLength(1)
  })
  it('one concurrent dedupe key commits once without reserving a rejected batch', async () => {
    const log = await owned(await root())
    const results = await Promise.all([
      log.append(session(), [entry()], unfenced, unconditional),
      log.append(session(), [entry()], unfenced, unconditional),
    ])
    expect(results).toContainEqual({ positions: [1], tail: 1 })
    expect(results).toContainEqual({ failure: 'alreadyRecorded', keys: ['key'] })
  })
  it.each(['single-first', 'batch-first'])(
    'response/message collision is all-or-nothing: %s',
    async order => {
      const log = await owned(await root())
      const response = entry('response', { original: order })
      const assistant = entry('message', { kind: 'assistant' })
      const batches =
        order === 'single-first'
          ? [[response], [assistant, { ...response, payload: { replacement: true } }]]
          : [[assistant, response], [{ ...response, payload: { replacement: true } }]]
      const first = batches[0]
      const second = batches[1]
      if (first === undefined || second === undefined) throw new Error('fixture')
      expect(await log.append(session(), first, unfenced, unconditional)).toHaveProperty(
        'positions',
      )
      expect(await log.append(session(), second, unfenced, unconditional)).toEqual({
        failure: 'alreadyRecorded',
        keys: ['response'],
      })
      const read = await log.readSince(session(), 0)
      if ('failure' in read) throw new Error('read failed')
      expect(read.entries).toHaveLength(order === 'single-first' ? 1 : 2)
      expect(read.entries.find(item => item.dedupeKey === 'response')?.payload).toEqual({
        original: order,
      })
    },
  )
  it.each(['new-attempt', 'same-attempt-end', 'noise'])(
    'all tail changes defeat a constructed conditional batch: %s',
    async kind => {
      const log = await owned(await root())
      expect(await log.readSince(session(), 0)).toEqual({ entries: [], tail: 0 })
      const boundary = {
        ...entry('boundary', { kind }),
        ...(kind === 'noise' ? {} : { run: 'run', attempt: kind === 'new-attempt' ? 2 : 1 }),
      }
      expect(await log.append(session(), [boundary], unfenced, unconditional)).toHaveProperty(
        'positions',
      )
      expect(
        await log.append(session(), [{ ...entry('response'), run: 'run', attempt: 1 }], unfenced, {
          kind: 'tailEquals',
          tail: 0,
        }),
      ).toEqual({ failure: 'tailChanged', tail: 1 })
      // Local driver only: a consumer re-reads and interprets its own declared records.
      const prefix = await log.readSince(session(), 0)
      if ('failure' in prefix) throw new Error('prefix unavailable')
      expect(
        await log.append(session(), [entry('response', { late: kind !== 'noise' })], unfenced, {
          kind: 'tailEquals',
          tail: prefix.tail,
        }),
      ).toHaveProperty('positions')
    },
  )
  it('response-first order keeps original values after later Run boundary', async () => {
    const log = await owned(await root())
    expect(
      await log.append(session(), [entry('response', { late: false })], unfenced, {
        kind: 'tailEquals',
        tail: 0,
      }),
    ).toHaveProperty('positions')
    expect(
      await log.append(
        session(),
        [{ ...entry('end', { kind: 'local-run-end' }), run: 'run', attempt: 1 }],
        unfenced,
        unconditional,
      ),
    ).toHaveProperty('positions')
    const read = await log.readByKey(session(), 'response')
    if ('failure' in read) throw new Error('read failed')
    expect(read.entries[0]?.payload).toEqual({ late: false })
  })
  it('stores core opaque values and exact decimal exchanges across both reads and reopen', async () => {
    const dir = await root()
    const log = await owned(dir)
    const decoded = readJsonStrict(
      '{"huge":9007199254740993,"money":0.12345678901234567890123456789,"nested":[1,"two",null,{"invalid_business":true}]}',
    )
    if ('failed' in decoded) throw new Error('fixture')
    const expected = writeJsonLossless(decoded.ok)
    expect(
      await log.append(
        session(),
        [entry('exact', toOpaqueJson(decoded.ok))],
        unfenced,
        unconditional,
      ),
    ).toHaveProperty('positions')
    for (const result of [
      await log.readSince(session(), 0),
      await log.readByKey(session(), 'exact'),
    ]) {
      if ('failure' in result) throw new Error('read')
      expect(writeJsonLossless(result.entries[0]?.payload)).toBe(expected)
      const payload = result.entries[0]?.payload
      if (typeof payload !== 'object' || payload === null)
        throw new Error('fixture payload is not an object')
      expect(Reflect.set(payload, 'changed', true)).toBe(false)
      expect(Object.isFrozen(result.entries[0]?.payload)).toBe(true)
    }
    await log.close()
    const next = await owned(dir)
    const read = await next.readByKey(session(), 'exact')
    if ('failure' in read) throw new Error('read')
    expect(writeJsonLossless(read.entries[0]?.payload)).toBe(expected)
  })
  it('readSince filters inside a batch, future-after reports actual tail and keyed reads stay partial', async () => {
    const log = await owned(await root())
    await log.append(
      session(),
      [entry('one'), entry('two'), entry('three')],
      unfenced,
      unconditional,
    )
    const since = await log.readSince(session(), 1)
    if ('failure' in since) throw new Error('read')
    expect(since.entries.map(item => item.position)).toEqual([2, 3])
    expect(since.tail).toBe(3)
    expect(await log.readSince(session(), new LosslessNumber('9007199254740993'))).toEqual({
      entries: [],
      tail: 3,
    })
    const keyed = await log.readByKey(session(), 'two')
    if ('failure' in keyed) throw new Error('read')
    expect(keyed.entries.map(item => item.position)).toEqual([2])
    expect(keyed.tail).toBe(3)
  })
  it('root deletion/replacement never becomes an authoritative empty session', async () => {
    const dir = await root()
    const log = await owned(dir)
    await rename(dir, `${dir}-original`)
    await mkdir(dir)
    for (const id of [session(), session('fresh')]) {
      expect(await log.readSince(id, 0)).toEqual({ failure: 'unavailable' })
      expect(await log.readByKey(id, 'absent')).toEqual({ failure: 'unavailable' })
      expect(await log.append(id, [entry()], unfenced, unconditional)).toEqual({
        failure: 'unavailable',
      })
    }
    expect(await readdir(dir)).toEqual([])
  })
  it('same process rejects a second owner until real close, including old references', async () => {
    const dir = await root()
    const log = await owned(dir)
    await expect(openJsonlSessionLog({ processOwnership, dir })).rejects.toThrow()
    const append = log.append
    await log.close()
    expect(await append(session(), [entry()], unfenced, unconditional)).toEqual({
      failure: 'unavailable',
    })
    expect(await log.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
    expect(await owned(dir)).toBeDefined()
  })
  it('queue bound includes the active physical task and close rejects not-started jobs', async () => {
    const dir = await root()
    const entered = deferred()
    const release = deferred()
    barriers.push(release.resolve)
    let writes = 0
    const files = interceptFiles((path, file) =>
      !path.endsWith('entries.jsonl')
        ? file
        : {
            ...file,
            async write(bytes) {
              writes++
              const done = await file.write(bytes)
              entered.resolve()
              await release.promise
              return done
            },
          },
    )
    // An append is admitted only after its root check (a real stat) and resident lookup, so the
    // second and third requests would otherwise race on stat completion and the third could
    // take the free slot (#40's family: call order is not completion order). Pin it: the third
    // request's root check starts only after the second one's finished and it was admitted.
    let armed = false,
      checks = 0
    const secondAdmitted = deferred()
    const io: typeof files = {
      ...files,
      async identity(path) {
        const check = armed ? ++checks : 0
        if (check === 2) await secondAdmitted.promise
        try {
          return await files.identity(path)
        } finally {
          if (check === 1) setImmediate(secondAdmitted.resolve)
        }
      },
    }
    const log = await openWithIo({ processOwnership, dir, policy: { appendQueueLimit: 2 } }, io)
    owners.push(log)
    const first = log.append(session(), [entry('first')], unfenced, { kind: 'tailEquals', tail: 0 })
    await entered.promise
    armed = true
    const second = log.append(session(), [entry('second')], unfenced, unconditional)
    const third = await log.append(session(), [entry('third')], unfenced, unconditional)
    expect(third).toEqual({ failure: 'unavailable' })
    let closed = false
    const closing = log.close().then(() => {
      closed = true
    })
    expect(await second).toEqual({ failure: 'unavailable' })
    await expect(openJsonlSessionLog({ processOwnership, dir })).rejects.toThrow()
    expect(closed).toBe(false)
    expect(writes).toBe(1)
    release.resolve()
    expect(await first).toEqual({ positions: [1], tail: 1 })
    await closing
    const next = await owned(dir)
    const read = await next.readSince(session(), 0)
    if ('failure' in read) throw new Error('read')
    expect(read.entries.map(item => item.dedupeKey)).toEqual(['first'])
  })
  it('different logs do not wait for a blocked append and all-busy residency rejects new IO', async () => {
    const dir = await root()
    const entered = deferred()
    const release = deferred()
    barriers.push(release.resolve)
    const blockedPath = paths(dir).entries
    const io = interceptFiles((path, file) =>
      path !== blockedPath
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
    const log = await openWithIo({ processOwnership, dir, policy: { residentLogsLimit: 2 } }, io)
    owners.push(log)
    const blocked = log.append(session(), [entry()], unfenced, unconditional)
    await entered.promise
    const other = session('other')
    expect(await log.append(other, [entry()], unfenced, unconditional)).toEqual({
      positions: [1],
      tail: 1,
    })
    release.resolve()
    await blocked
    const tightDir = await root()
    const tightEntered = deferred()
    const tightRelease = deferred()
    barriers.push(tightRelease.resolve)
    const tightIo = interceptFiles((path, file) =>
      !path.endsWith('entries.jsonl')
        ? file
        : {
            ...file,
            async write(bytes) {
              const count = await file.write(bytes)
              tightEntered.resolve()
              await tightRelease.promise
              return count
            },
          },
    )
    const tight = await openWithIo(
      { processOwnership, dir: tightDir, policy: { residentLogsLimit: 1 } },
      tightIo,
    )
    owners.push(tight)
    const active = tight.append(session(), [entry()], unfenced, unconditional)
    await tightEntered.promise
    expect(await tight.readSince(other, 0)).toEqual({ failure: 'unavailable' })
    expect(await tight.append(other, [entry()], unfenced, unconditional)).toEqual({
      failure: 'unavailable',
    })
    expect((await readdir(tightDir)).filter(name => !name.startsWith('.owner-lock'))).toEqual([
      paths(tightDir).directory.split('/').pop(),
    ])
    tightRelease.resolve()
    await active
  })
  it('idle LRU reopens from healthy indexes without changing dedupe or positions', async () => {
    const dir = await root()
    const log = await owned(dir, { processOwnership, dir, policy: { residentLogsLimit: 1 } })
    await log.append(session(), [entry()], unfenced, unconditional)
    await log.append(session('other'), [entry('other')], unfenced, unconditional)
    expect(await log.append(session(), [entry()], unfenced, unconditional)).toEqual({
      failure: 'alreadyRecorded',
      keys: ['key'],
    })
    expect(await log.append(session(), [entry('fresh')], unfenced, unconditional)).toEqual({
      positions: [2],
      tail: 2,
    })
  })
  it('half final line repairs but corrupt middle/position/session stay unavailable and unchanged', async () => {
    for (const corruption of ['half', 'middle', 'position', 'session']) {
      const dir = await root()
      const log = await owned(dir)
      await log.append(session(), [entry()], unfenced, unconditional)
      await log.close()
      const original = await readFile(paths(dir).entries, 'utf8')
      const bad =
        corruption === 'half'
          ? `${original}{"v":1`
          : corruption === 'middle'
            ? `bad\n${original}`
            : corruption === 'position'
              ? original.replace('"first":1', '"first":2')
              : original.replace('"session":"session"', '"session":"other"')
      await writeFile(paths(dir).entries, bad)
      await writeFile(paths(dir).index, 'invalid\n')
      const next = await owned(dir)
      const read = await next.readSince(session(), 0)
      if (corruption === 'half') {
        expect(read).toHaveProperty('tail', 1)
        expect(await readFile(paths(dir).entries, 'utf8')).toBe(original)
      } else {
        expect(read).toEqual({ failure: 'unavailable' })
        expect(await readFile(paths(dir).entries, 'utf8')).toBe(bad)
      }
    }
  })
})

describe('healthy derived indexes and their explicit trust premise', () => {
  it.each(['missing', 'half', 'lag', 'structure', 'version'])(
    'rebuilds or catches up an index with %s damage',
    async kind => {
      const dir = await root()
      const log = await owned(dir)
      await log.append(
        session(),
        [{ ...entry('one'), run: 'run', attempt: 5 }],
        unfenced,
        unconditional,
      )
      await log.append(
        session(),
        [{ ...entry('two'), run: 'run', attempt: 7 }],
        unfenced,
        unconditional,
      )
      await log.close()
      const index = await readFile(paths(dir).index, 'utf8')
      const first = index.split('\n')[0]
      if (first === undefined) throw new Error('fixture')
      const replacement =
        kind === 'missing'
          ? ''
          : kind === 'half'
            ? `${first}\n{"v":1`
            : kind === 'lag'
              ? `${first}\n`
              : kind === 'structure'
                ? index.replace('"start":0', '"start":1')
                : index.replaceAll('"v":1', '"v":2')
      if (kind === 'missing') await unlink(paths(dir).index)
      else await writeFile(paths(dir).index, replacement)
      const next = await owned(dir)
      expect(await next.append(session(), [entry('two')], unfenced, unconditional)).toEqual({
        failure: 'alreadyRecorded',
        keys: ['two'],
      })
      const read = await next.readSince(session(), 0)
      if ('failure' in read) throw new Error('read')
      expect(read.entries.map(item => item.position)).toEqual([1, 2])
      const keyed = await next.readByKey(session(), 'read')
      expect(writeJsonLossless(keyed)).toBe(writeJsonLossless(read))
      expect(
        await next.append(
          session(),
          [{ ...entry('late'), run: 'run', attempt: 6 }],
          { kind: 'fenced', run: 'run', attempt: 6 },
          unconditional,
        ),
      ).toEqual({ failure: 'attemptSuperseded' })
    },
  )
  it('V1 expected counterexample: structurally valid missing dedupe permits a second commit', async () => {
    const dir = await root()
    const log = await owned(dir)
    await log.append(session(), [entry()], unfenced, unconditional)
    await log.close()
    const index = await readFile(paths(dir).index, 'utf8')
    await writeFile(paths(dir).index, index.replace('"dedupe":["key"]', '"dedupe":[]'))
    const next = await owned(dir)
    expect(await next.append(session(), [entry()], unfenced, unconditional)).toEqual({
      positions: [2],
      tail: 2,
    })
    const read = await next.readSince(session(), 0)
    if ('failure' in read) throw new Error('read')
    expect(read.entries.map(item => item.dedupeKey)).toEqual(['key', 'key'])
  })
  it('index-write failure warns but does not lose or duplicate a confirmed batch', async () => {
    const dir = await root()
    const diagnostics: unknown[] = []
    const io = interceptFiles((path, file) =>
      !path.endsWith('index.jsonl')
        ? file
        : {
            ...file,
            async write() {
              throw new IoFailure('injected-index')
            },
          },
    )
    const log = await openWithIo(
      { processOwnership, dir, diagnostic: event => diagnostics.push(event) },
      io,
    )
    owners.push(log)
    expect(await log.append(session(), [entry()], unfenced, unconditional)).toEqual({
      positions: [1],
      tail: 1,
    })
    expect(diagnostics).toContainEqual({
      level: 'warn',
      stage: 'index',
      sessionHash: paths(dir).directory.split('/').pop(),
    })
    await log.close()
    const next = await owned(dir)
    expect(await next.append(session(), [entry()], unfenced, unconditional)).toEqual({
      failure: 'alreadyRecorded',
      keys: ['key'],
    })
  })
})
