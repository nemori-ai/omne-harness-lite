import { expect, test, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { sql } from 'kysely'
import {
  LosslessNumber,
  writeJsonLossless,
  readJsonStrict,
} from '@omne-harness-lite/content-blocks'
import {
  narrow,
  StorageUnavailable,
  StorageDefect,
  UniqueViolation,
  type ReadTx,
} from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  createAssemblyManifestStore,
  assemblyManifestStorePlugin,
  type ManifestDb,
  type AssemblyManifestService,
} from '../src/index.ts'
import { database, input, evaluated } from './support.ts'

test('known empty, lossless record, history and evaluation survive real file reopen', async () => {
  await database(async (storage, file) => {
    const store = createAssemblyManifestStore(storage)
    expect(await store.readHead('session')).toEqual({ head: 0, latest: {} })
    expect(await store.readEvaluation('session')).toEqual({ failure: 'recordNotFound' })
    expect(await store.append('session', 0, input(1, 'given'))).toMatchObject({
      seq: 1,
      evaluationRef: 'given_a',
      head: 1,
    })
    const history = await store.readHistory('session', 'tool', 1)
    if (!('record' in history)) throw new Error('history absent')
    expect(writeJsonLossless(history.record.content)).toContain('9007199254740993')
    expect(writeJsonLossless(history.record.tables.tool?.composition)).toContain(
      '0.10000000000000000001',
    )
    await store.close()
    await storage.close()
    const reopened = await openStorage({ dialect: 'sqlite', file })
    try {
      const reader = createAssemblyManifestStore(reopened)
      expect(await reader.readHistory('session', 'tool', 1)).toEqual(history)
      expect(await reader.readEvaluation('session')).toEqual({
        evaluationRef: 'given_a',
        evaluation: evaluated(),
        compositionOrder: [],
      })
      await reader.close()
    } finally {
      await reopened.close()
    }
  })
})
test('all reference/head/time conclusions retain their required priority and do no writes', async () => {
  await database(async storage => {
    const store = createAssemblyManifestStore(storage)
    await store.append('session', 0, input(10, 'given'))
    expect(await store.append('session', 999, input(0, 'given'))).toHaveProperty(
      'failure',
      'alreadyRecorded',
    )
    expect(await store.append('another', 999, input(0, 'given'))).toEqual({
      failure: 'evaluationRefConflict',
    })
    expect(await store.append('session', 999, input(0, 'reuse', 'missing'))).toEqual({
      failure: 'recordNotFound',
    })
    expect(await store.append('another', 0, input(20, 'reuse'))).toEqual({
      failure: 'recordNotFound',
    })
    expect(await store.append('session', 999, input(0, 'reuse'))).toEqual({
      failure: 'headMismatch',
      head: 1,
    })
    expect(await store.append('session', 1, input(10, 'mint'))).toEqual({
      failure: 'filledAtNotIncreasing',
      categories: ['tool'],
    })
    const minted = await store.append('session', 1, input(11))
    if (!('seq' in minted)) throw new Error('mint failed')
    expect(minted.evaluationRef).toMatch(/^[A-Za-z0-9_-]{22}$/u)
    expect(await store.append('session', 2, input(12, 'given', minted.evaluationRef))).toEqual({
      failure: 'evaluationRefConflict',
    })
    expect(await store.append('session', new LosslessNumber('1e100000'), input(12))).toEqual({
      failure: 'headMismatch',
      head: 2,
    })
    const current = await store.readHead('session')
    expect(current).toHaveProperty('head', 2)
    await store.close()
  })
})
test('two actual storage instances race the same expected head: exactly one commits', async () => {
  await database(async (storage, file) => {
    const other = await openStorage({ dialect: 'sqlite', file })
    const a = createAssemblyManifestStore(storage),
      b = createAssemblyManifestStore(other)
    try {
      const results = await Promise.all([
        a.append('session', 0, input()),
        b.append('session', 0, input()),
      ])
      expect(results.filter(item => 'seq' in item)).toHaveLength(1)
      expect(results.filter(item => 'failure' in item)).toEqual([
        { failure: 'headMismatch', head: 1 },
      ])
      const count = await storage.read(tx =>
        narrow<ManifestDb>(tx).selectFrom('assembly_manifest_record').selectAll().execute(),
      )
      expect(count).toHaveLength(1)
    } finally {
      await a.close()
      await b.close()
      await other.close()
    }
  })
})
test('global given reference races across two sessions and two real writers', async () => {
  await database(async (storage, file) => {
    const other = await openStorage({ dialect: 'sqlite', file })
    const a = createAssemblyManifestStore(storage),
      b = createAssemblyManifestStore(other)
    try {
      const results = await Promise.all([
        a.append('session_a', 0, input(1, 'given')),
        b.append('session_b', 0, input(1, 'given')),
      ])
      expect(results.filter(item => 'seq' in item)).toHaveLength(1)
      expect(results.filter(item => 'failure' in item)).toEqual([
        { failure: 'evaluationRefConflict' },
      ])
    } finally {
      await a.close()
      await b.close()
      await other.close()
    }
  })
})
test('history returns the whole multi-table parent, retains old filledAt and isolates sessions', async () => {
  await database(async storage => {
    const store = createAssemblyManifestStore(storage)
    await store.append('session', 0, {
      ...input(1, 'given'),
      tables: {
        tool: { filledAt: 1, composition: [] },
        slash_command: { filledAt: 5, composition: { command: 'a' } },
      },
    })
    await store.append('session', 1, {
      ...input(6),
      tables: { slash_command: { filledAt: 6, composition: { command: 'b' } } },
    })
    await store.append('session', 2, {
      ...input(7, 'reuse'),
      tables: { slash_command: { filledAt: 7, composition: [] } },
    })
    expect(await store.readHistory('session', 'slash_command', 5)).toHaveProperty(
      'record.tables.tool',
    )
    expect(await store.readHistory('session', 'slash_command', 6)).toHaveProperty('record.seq', 2)
    expect(await store.readHistory('session', 'slash_command', 7)).toHaveProperty(
      'record.evaluation.kind',
      'reuse',
    )
    expect(await store.readHistory('session', 'tool', 6)).toEqual({ failure: 'recordNotFound' })
    expect(await store.readHistory('another', 'slash_command', 5)).toEqual({
      failure: 'recordNotFound',
    })
    const current = await store.readHead('session')
    expect(current).toMatchObject({
      head: 3,
      latest: { tool: { seq: 1 }, slash_command: { seq: 3, evaluationRef: 'given_a' } },
    })
    await store.close()
  })
})
test('latest committed given/mint wins by seq, never follows a reuse back or borrows another session', async () => {
  await database(async storage => {
    const store = createAssemblyManifestStore(storage)
    await store.append('session', 0, input(1, 'given'))
    const second = await store.append('session', 1, input(2))
    if (!('seq' in second)) throw new Error('mint failed')
    await store.append('session', 2, { ...input(3, 'reuse'), content: null })
    await store.append('other_session', 0, { ...input(100, 'given', 'other_ref'), content: [] })
    expect(await store.readEvaluation('session')).toEqual({
      evaluationRef: second.evaluationRef,
      evaluation: evaluated(),
      compositionOrder: [],
    })
    expect(await store.readHead('session')).toHaveProperty('latest.tool.evaluationRef', 'given_a')
    await store.append('session', 3, {
      ...input(4),
      content: { evaluation: evaluated(), compositionOrder: [evaluated().root] },
    })
    expect(await store.readEvaluation('session')).toEqual({
      failure: 'unavailable',
      reason: 'invalid_evaluation_content',
    })
    expect(await store.readHistory('session', 'tool', 4)).toHaveProperty('record')
    await store.close()
  })
})
test('genuine ReadTx isolates head/evaluation from a concurrently committed newer mint', async () => {
  await database(async (storage, file) => {
    const store = createAssemblyManifestStore(storage)
    await store.append('session', 0, input(1, 'given'))
    const writerStorage = await openStorage({ dialect: 'sqlite', file })
    const writer = createAssemblyManifestStore(writerStorage)
    const actual = storage.read.bind(storage)
    const spy = vi.spyOn(storage, 'read').mockImplementation(fn =>
      actual(async tx => {
        // Establish the actual SQLite read view, then commit through a separate real writer.
        await narrow<ManifestDb>(tx).selectFrom('assembly_manifest_record').selectAll().execute()
        const written = await writer.append('session', 1, input(2))
        expect(written).toHaveProperty('seq', 2)
        return fn(tx)
      }),
    )
    try {
      expect(await store.readEvaluation('session')).toHaveProperty('evaluationRef', 'given_a')
    } finally {
      spy.mockRestore()
      await writer.close()
      await writerStorage.close()
    }
    expect(await store.readHead('session')).toHaveProperty('head', 2)
    await store.close()
  })
})
test('invalid shape performs zero IO; unreadable never returns an empty head/history', async () => {
  await database(async storage => {
    const store = createAssemblyManifestStore(storage)
    const read = vi.spyOn(storage, 'read'),
      write = vi.spyOn(storage, 'write')
    expect(await store.readHead(undefined)).toEqual({ failure: 'invalidInput' })
    expect(await store.append('session', undefined, input())).toEqual({ failure: 'invalidInput' })
    expect(await store.readHistory('session', 'unknown', 1)).toEqual({ failure: 'invalidInput' })
    expect(await store.dependencyPresence('session', [])).toEqual({ failure: 'invalidInput' })
    expect(await store.dependencyPresence('session', ['a', 'a'])).toEqual({
      failure: 'invalidInput',
    })
    expect(read).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    read.mockRejectedValueOnce(new StorageUnavailable('read not available'))
    expect(await store.readHead('session')).toEqual({ failure: 'unavailable' })
    read.mockRejectedValueOnce(new StorageUnavailable('read not available'))
    expect(await store.readHistory('session', 'tool', 1)).toEqual({ failure: 'unavailable' })
    write.mockRejectedValueOnce(new StorageUnavailable('write not available'))
    expect(await store.append('session', 0, input())).toEqual({ failure: 'unavailable' })
    read.mockRejectedValueOnce(new StorageDefect('injected programming defect'))
    await expect(store.readHead('session')).rejects.toBeInstanceOf(StorageDefect)
    read.mockRestore()
    write.mockRestore()
    await store.close()
  })
})
test('third table failure rolls back parent and earlier tables; never recognizes its own partial given', async () => {
  await database(async storage => {
    await storage.write(tx =>
      sql`CREATE TRIGGER inject_table_failure BEFORE INSERT ON assembly_manifest_table WHEN NEW.category = 'slash_command' BEGIN SELECT RAISE(ABORT, 'injected table failure'); END`.execute(
        tx.db,
      ),
    )
    const store = createAssemblyManifestStore(storage)
    await expect(
      store.append('session', 0, {
        ...input(1, 'given'),
        tables: {
          tool: { filledAt: 1, composition: [] },
          skill: { filledAt: 1, composition: [] },
          slash_command: { filledAt: 1, composition: [] },
        },
      }),
    ).rejects.toBeInstanceOf(StorageDefect)
    const rows = await storage.read(async tx => ({
      records: await narrow<ManifestDb>(tx)
        .selectFrom('assembly_manifest_record')
        .selectAll()
        .execute(),
      tables: await narrow<ManifestDb>(tx)
        .selectFrom('assembly_manifest_table')
        .selectAll()
        .execute(),
    }))
    expect(rows).toEqual({ records: [], tables: [] })
    await store.close()
  })
})
test('real table UNIQUE after parent must escape, not return alreadyRecorded', async () => {
  await database(async storage => {
    await storage.write(async tx => {
      await sql`CREATE TRIGGER inject_unique BEFORE INSERT ON assembly_manifest_table WHEN NEW.category = 'skill' BEGIN INSERT INTO assembly_manifest_table(session,seq,category,filled_at,composition) VALUES(NEW.session,NEW.seq,NEW.category,NEW.filled_at,'[]'); END`.execute(
        tx.db,
      )
    })
    const store = createAssemblyManifestStore(storage)
    await expect(
      store.append('session', 0, {
        ...input(1, 'given'),
        tables: { tool: { filledAt: 1, composition: [] }, skill: { filledAt: 1, composition: [] } },
      }),
    ).rejects.toBeInstanceOf(UniqueViolation)
    expect(await store.readHead('session')).toEqual({ head: 0, latest: {} })
    const rows = await storage.read(tx =>
      narrow<ManifestDb>(tx).selectFrom('assembly_manifest_table').selectAll().execute(),
    )
    expect(rows).toEqual([])
    await store.close()
  })
})
test('close after prior idle waits for a later actual read; withdrawn Cordis reference cannot admit', async () => {
  await database(async storage => {
    const ctx = new Context()
    ctx.provide('storage', storage)
    const fiber = ctx.plugin(assemblyManifestStorePlugin)
    await fiber.ready()
    const store = ctx.get('assemblyManifest') as AssemblyManifestService
    await store.readHead('session')
    let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => {
        release = resolve
      }),
      started = new Promise<void>(resolve => {
        entered = resolve
      })
    const actual = storage.read.bind(storage)
    const spy = vi.spyOn(storage, 'read').mockImplementation(fn =>
      actual(async tx => {
        entered()
        await gate
        return fn(tx)
      }),
    )
    const active = store.readHead('session')
    await started
    let drained = false
    const closing = fiber.dispose().then(() => {
      drained = true
    })
    await Promise.resolve()
    expect(drained).toBe(false)
    expect(await store.readHead('session')).toEqual({ failure: 'unavailable' })
    release()
    expect(await active).toEqual({ head: 0, latest: {} })
    await closing
    expect(drained).toBe(true)
    spy.mockRestore()
    expect(await createAssemblyManifestStore(storage).readHead('session')).toEqual({
      head: 0,
      latest: {},
    })
    await ctx.dispose()
  })
})
test('presence needs a real configured observation; sink failure is reported separately with no content', async () => {
  await database(async storage => {
    const failures: unknown[] = [],
      events: unknown[] = []
    const source = {
      async read(session: string, names: readonly string[]) {
        expect(session).toBe('session')
        expect(names).toEqual(['svc-a', 'svc-b'])
        return { 'svc-a': 'present', 'svc-b': 'absent' } as const
      },
    }
    const store = createAssemblyManifestStore(storage, {
      presenceSource: source,
      diagnostic(event) {
        events.push(event)
        throw new Error('sink unavailable')
      },
      diagnosticFailure(fact) {
        failures.push(fact)
      },
    })
    expect(await store.dependencyPresence('session', ['svc-a', 'svc-b'])).toEqual({
      presence: { 'svc-a': 'present', 'svc-b': 'absent' },
    })
    expect(await store.append('session', 0, input())).toHaveProperty('seq', 1)
    expect(events).toHaveLength(2)
    expect(failures).toHaveLength(2)
    expect(JSON.stringify(events)).not.toContain('precision')
    expect(events[1]).toMatchObject({ resourceEnded: true, result: 'success', head: 1 })
    const without = createAssemblyManifestStore(storage)
    expect(await without.dependencyPresence('session', ['svc-a'])).toEqual({
      failure: 'unavailable',
    })
    await store.close()
    await without.close()
  })
})
