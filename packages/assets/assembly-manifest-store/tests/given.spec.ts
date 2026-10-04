import { expect, test, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { sql } from 'kysely'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  narrow,
  StorageUnavailable,
  StorageDefect,
  UniqueViolation,
} from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { createAssemblyManifestStore, assemblyManifestStorePlugin, type ManifestDb, type ManifestDiagnostic } from '../src/index.ts'
import { checkManifestGivenReadInput, type AssemblyManifestService } from '@omne-harness-lite/assembly-manifest'
import { database, evaluated, input } from './support.ts'

const categories = ['tool', 'skill', 'mcp', 'slash_command', 'plugin', 'loop_extension'] as const
const sixTables = Object.fromEntries(
  categories.map(category => [
    category,
    {
      filledAt: 1,
      composition: { original: category, exact: new LosslessNumber('0.10000000000000000001') },
    },
  ]),
)

test('fixed H recovers the full given after every category is replaced and the real file reopens', async () => {
  await database(async (storage, file) => {
    const store = createAssemblyManifestStore(storage)
    // This exercises MF storage only. AR's actual complete-fill producer is a separate obligation.
    expect(
      await store.append('session', 0, { ...input(1, 'given'), tables: sixTables }),
    ).toHaveProperty('seq', 1)
    const original = await store.readGiven('session', 1)
    if (!('record' in original)) throw new Error('original given missing')
    for (const [offset, category] of categories.entries()) {
      expect(
        await store.append('session', offset + 1, {
          ...input(offset + 2),
          tables: { [category]: { filledAt: offset + 2, composition: { replaced: category } } },
        }),
      ).toHaveProperty('seq', offset + 2)
      expect(await store.readGiven('session', offset + 2)).toEqual(original)
    }
    expect(await store.append('session', 7, input(8, 'reuse'))).toHaveProperty('seq', 8)
    const current = await store.readHead('session')
    if (!('head' in current)) throw new Error('head unavailable')
    expect(Object.values(current.latest).every(record => record?.evaluation.kind !== 'given')).toBe(
      true,
    )
    expect(await store.readEvaluation('session')).not.toHaveProperty('evaluationRef', 'given_a')
    const second = {
      ...input(9, 'given', 'given_b'),
      tables: Object.fromEntries(
        categories.map(category => [
          category,
          {
            filledAt: 9,
            composition: { second: category },
          },
        ]),
      ),
    }
    expect(await store.append('session', 8, second)).toHaveProperty('seq', 9)
    expect(await store.readGiven('session', 8)).toEqual(original)
    const newer = await store.readGiven('session', 9)
    expect(newer).toHaveProperty('record.evaluationRef', 'given_b')
    await store.close()
    await storage.close()
    const reopenedStorage = await openStorage({ dialect: 'sqlite', file })
    const reopened = createAssemblyManifestStore(reopenedStorage)
    try {
      expect(await reopened.readGiven('session', 8)).toEqual(original)
      expect(await reopened.readGiven('session', 9)).toEqual(newer)
      expect(await reopened.readGiven('other_session', 0)).toEqual({ none: true })
      expect(await reopened.readGiven('other_session', 9)).toEqual({ failure: 'invalidInput' })
      expect(await reopened.readHistory('session', 'skill', 1)).toEqual(original)
    } finally {
      await reopened.close()
      await reopenedStorage.close()
    }
  })
})

test.each([
  undefined,
  null,
  true,
  false,
  -1,
  0.5,
  '0',
  NaN,
  Infinity,
  new LosslessNumber('-1e100'),
  new LosslessNumber('1e-1'),
])('illegal represented H %s returns invalidInput with zero IO', async value => {
  await database(async storage => {
    const store = createAssemblyManifestStore(storage)
    const read = vi.spyOn(storage, 'read')
    expect(await store.readGiven('session', value)).toEqual({ failure: 'invalidInput' })
    expect(await store.readGiven(' invalid_session', 0)).toEqual({ failure: 'invalidInput' })
    expect(read).not.toHaveBeenCalled()
    read.mockRestore()
    await store.close()
  })
})

test('zero, signed zero and huge legal H all require actual head IO; a missing given is explicitly none', async () => {
  await database(async storage => {
    const store = createAssemblyManifestStore(storage)
    const read = vi.spyOn(storage, 'read')
    for (const zero of [0, -0, new LosslessNumber('-0e999999'), new LosslessNumber('0e999999')])
      expect(await store.readGiven('session', zero)).toEqual({ none: true })
    expect(read).toHaveBeenCalledTimes(4)
    const huge = new LosslessNumber('1e999999')
    read.mockRejectedValueOnce(new StorageUnavailable('injected head unavailable'))
    expect(await store.readGiven('session', huge)).toEqual({ failure: 'unavailable' })
    expect(await store.readGiven('session', huge)).toEqual({ failure: 'invalidInput' })
    expect(read).toHaveBeenCalledTimes(6)
    expect(await store.append('session', 0, input())).toHaveProperty('seq', 1)
    expect(await store.readGiven('session', new LosslessNumber('1.00'))).toEqual({ none: true })
    read.mockRestore()
    await store.close()
  })
})

test('MF preserves non-assembly content, non-six tables, unknown members and lossless values without AR rules', async () => {
  await database(async storage => {
    const store = createAssemblyManifestStore(storage)
    const original = {
      ...input(1, 'given'),
      content: {
        ...input().content,
        filledBy: 'some_other_producer',
        extra: { nested: ['unchanged'] },
      },
    }
    await store.append('session', 0, original)
    const found = await store.readGiven('session', 1)
    if (!('record' in found)) throw new Error('valid non-AR given unavailable')
    expect(writeJsonLossless(found.record.content)).toBe(writeJsonLossless(original.content))
    expect(writeJsonLossless(found.record.tables.tool?.composition)).toContain(
      '0.10000000000000000001',
    )
    expect(Object.keys(found.record.tables)).toEqual(['tool'])
    expect(Object.isFrozen(found.record.content)).toBe(true)
    expect(() => Object.assign(found.record.content as object, { extra: null })).toThrow()
    expect(await store.readGiven('session', 1)).toEqual(found)
    await store.close()
  })
})

test.each([
  null,
  {},
  { evaluation: evaluated() },
  { evaluation: { ...evaluated(), unknown: true }, compositionOrder: [] },
  { evaluation: evaluated(), compositionOrder: [evaluated().root] },
])('latest given with invalid full E/O never falls back to an older source: %j', async content => {
  await database(async storage => {
    const store = createAssemblyManifestStore(storage)
    await store.append('session', 0, input(1, 'given'))
    await store.append('session', 1, { ...input(2, 'given', 'given_b'), content })
    expect(await store.readGiven('session', 1)).toHaveProperty('record.evaluationRef', 'given_a')
    expect(await store.readGiven('session', 2)).toEqual({
      failure: 'unavailable',
      reason: 'invalid_evaluation_content',
    })
    await store.close()
  })
})

test.each(['json', 'empty_tables', 'table_category', 'table_time', 'shell_ref'])(
  'known persistent corruption %s is unavailable, never none or old given',
  async damage => {
    await database(async storage => {
      const store = createAssemblyManifestStore(storage)
      await store.append('session', 0, input(1, 'given'))
      await store.append('session', 1, input(2, 'given', 'given_b'))
      // Deliberate out-of-protocol database corruption, not a product mutation API.
      await storage.write(async tx => {
        const db = narrow<ManifestDb>(tx)
        if (damage === 'json')
          await db
            .updateTable('assembly_manifest_record')
            .set({ content: '{"evaluation":0,"evaluation":1}' })
            .where('seq', '=', 2)
            .execute()
        else if (damage === 'empty_tables')
          await db.deleteFrom('assembly_manifest_table').where('seq', '=', 2).execute()
        else if (damage === 'table_category')
          await db
            .updateTable('assembly_manifest_table')
            .set({ category: 'invalid_category' })
            .where('seq', '=', 2)
            .execute()
        else if (damage === 'table_time')
          await db
            .updateTable('assembly_manifest_table')
            .set({ filled_at: 1.5 })
            .where('seq', '=', 2)
            .execute()
        else
          await db
            .updateTable('assembly_manifest_record')
            .set({ evaluation_ref: ' invalid_ref', owned_ref: ' invalid_ref' })
            .where('seq', '=', 2)
            .execute()
      })
      expect(await store.readGiven('session', 2)).toEqual({ failure: 'unavailable' })
      expect(await store.readGiven('session', 1)).toHaveProperty('record.evaluationRef', 'given_a')
      if (damage === 'json') {
        await expect(store.readHistory('session', 'tool', 2)).rejects.toBeInstanceOf(StorageDefect)
        await expect(store.readHead('session')).rejects.toBeInstanceOf(StorageDefect)
        expect(await store.readEvaluation('session')).toEqual({ failure: 'unavailable' })
      }
      await store.close()
    })
  },
)

test('genuine missing schema and unrelated defects propagate instead of becoming unavailable', async () => {
  await database(async storage => {
    const store = createAssemblyManifestStore(storage)
    await store.append('session', 0, input(1, 'given'))
    const read = vi.spyOn(storage, 'read')
    read.mockRejectedValueOnce(new TypeError('injected API defect'))
    await expect(store.readGiven('session', 1)).rejects.toBeInstanceOf(TypeError)
    read.mockRestore()
    await storage.write(tx =>
      sql`ALTER TABLE assembly_manifest_table RENAME COLUMN composition TO broken_composition`.execute(
        tx.db,
      ),
    )
    await expect(store.readGiven('session', 1)).rejects.toBeInstanceOf(StorageDefect)
    await store.close()
  })
})

test('actual SQLite ReadTx retains its snapshot while a separate real writer commits a newer given', async () => {
  await database(async (storage, file) => {
    const reader = createAssemblyManifestStore(storage)
    await reader.append('session', 0, input(1, 'given'))
    const original = await reader.readGiven('session', 1)
    const otherStorage = await openStorage({ dialect: 'sqlite', file })
    const writer = createAssemblyManifestStore(otherStorage)
    const actual = storage.read.bind(storage)
    const spy = vi.spyOn(storage, 'read').mockImplementation(fn =>
      actual(async tx => {
        await narrow<ManifestDb>(tx).selectFrom('assembly_manifest_record').selectAll().execute()
        expect(await writer.append('session', 1, input(2, 'given', 'given_b'))).toHaveProperty(
          'seq',
          2,
        )
        return fn(tx)
      }),
    )
    try {
      expect(await reader.readGiven('session', 1)).toEqual(original)
    } finally {
      spy.mockRestore()
      await writer.close()
      await otherStorage.close()
    }
    expect(await reader.readGiven('session', 2)).toHaveProperty('record.evaluationRef', 'given_b')
    await reader.close()
  })
})

test('capacity fixture stops before insert or mint and preserves the original reference priorities', async () => {
  await database(async storage => {
    const events: ManifestDiagnostic[] = []
    const store = createAssemblyManifestStore(storage, {
      diagnostic: event => events.push(event),
      diagnosticFailure: () => {},
    })
    await store.append('session', 0, input(1, 'given'))
    // Capacity fixture, not a claim that 2^53 complete historical records were written.
    await storage.write(async tx => {
      const db = narrow<ManifestDb>(tx)
      await db
        .insertInto('assembly_manifest_record')
        .values({
          session: 'session',
          seq: Number.MAX_SAFE_INTEGER,
          evaluation_kind: 'mint',
          evaluation_ref: 'capacity_ref',
          owned_ref: 'capacity_ref',
          content: writeJsonLossless(input().content),
        })
        .execute()
      await db
        .insertInto('assembly_manifest_table')
        .values({
          session: 'session',
          seq: Number.MAX_SAFE_INTEGER,
          category: 'tool',
          filled_at: 2,
          composition: '[]',
        })
        .execute()
      await sql`CREATE TRIGGER reject_new_parent BEFORE INSERT ON assembly_manifest_record BEGIN SELECT RAISE(ABORT, 'capacity must not insert'); END`.execute(
        tx.db,
      )
    })
    expect(
      await store.append('session', new LosslessNumber('9007199254740993'), input(3, 'given')),
    ).toHaveProperty('failure', 'alreadyRecorded')
    expect(
      await store.append('other', new LosslessNumber('9007199254740993'), input(3, 'given')),
    ).toEqual({ failure: 'evaluationRefConflict' })
    expect(
      await store.append(
        'session',
        new LosslessNumber('9007199254740993'),
        input(3, 'reuse', 'missing'),
      ),
    ).toEqual({ failure: 'recordNotFound' })
    expect(await store.append('session', Number.MAX_SAFE_INTEGER, input(3))).toEqual({
      failure: 'unavailable',
    })
    expect(events.at(-1)).toMatchObject({
      stage: 'capacity',
      resourceEnded: true,
      result: 'unavailable',
    })
    expect(await store.readGiven('session', Number.MAX_SAFE_INTEGER)).toHaveProperty(
      'record.evaluationRef',
      'given_a',
    )
    await store.close()
  })
})

test('first parent UNIQUE with no actual conclusion rethrows without retry and rolls back', async () => {
  await database(async storage => {
    await storage.write(tx =>
      sql`CREATE TRIGGER parent_conflict BEFORE INSERT ON assembly_manifest_record BEGIN INSERT INTO assembly_manifest_record(session,seq,evaluation_kind,evaluation_ref,owned_ref,content) VALUES(NEW.session,NEW.seq,NEW.evaluation_kind,NEW.evaluation_ref,NEW.owned_ref,NEW.content); END`.execute(
        tx.db,
      ),
    )
    const events: ManifestDiagnostic[] = []
    const store = createAssemblyManifestStore(storage, {
      diagnostic: event => events.push(event),
      diagnosticFailure: () => {},
    })
    const read = vi.spyOn(storage, 'read'),
      write = vi.spyOn(storage, 'write')
    await expect(store.append('session', 0, input())).rejects.toBeInstanceOf(UniqueViolation)
    expect(write).toHaveBeenCalledTimes(1)
    expect(read).not.toHaveBeenCalled()
    expect(events.at(-1)).toMatchObject({
      stage: 'parent_conflict',
      result: 'defect',
      resourceEnded: true,
    })
    read.mockRestore()
    write.mockRestore()
    expect(await store.readHead('session')).toEqual({ head: 0, latest: {} })
    await store.close()
  })
})

test('Cordis withdrawal closes all six methods and waits for an actual given read after earlier idle', async () => {
  await database(async storage => {
    const events: ManifestDiagnostic[] = []
    const ctx = new Context()
    ctx.provide('storage', storage)
    const fiber = ctx.plugin(assemblyManifestStorePlugin, {
      diagnostic: (event: ManifestDiagnostic) => events.push(event),
      diagnosticFailure: () => {},
    })
    await fiber
    const service = ctx.get('assemblyManifest') as AssemblyManifestService
    expect(Object.keys(service).sort()).toEqual(
      [
        'append',
        'dependencyPresence',
        'readEvaluation',
        'readGiven',
        'readHead',
        'readHistory',
      ].sort(),
    )
    await service.readGiven('session', 0)
    let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const ready = new Promise<void>(resolve => {
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
    const active = service.readGiven('session', 0)
    await ready
    let closed = false
    const closing = fiber.dispose().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    expect(events).toHaveLength(1)
    expect(await service.readGiven('session', 0)).toEqual({ failure: 'unavailable' })
    release()
    expect(await active).toEqual({ none: true })
    await closing
    expect(events.at(-1)).toMatchObject({
      operation: 'readGiven',
      result: 'none',
      resourceEnded: true,
    })
    spy.mockRestore()
    const fresh = createAssemblyManifestStore(storage)
    expect(await fresh.readGiven('session', 0)).toEqual({ none: true })
    await fresh.close()
  })
})

test('huge H diagnostic omits the input value, contains only bounded facts and runs after real resource release', async () => {
  await database(async storage => {
    const events: ManifestDiagnostic[] = [],
      failures: unknown[] = []
    const store = createAssemblyManifestStore(storage, {
      diagnostic(event) {
        events.push(event)
        throw new Error('do not forward this error message')
      },
      diagnosticFailure(fact) {
        failures.push(fact)
      },
    })
    const huge = new LosslessNumber('1e999999')
    expect(checkManifestGivenReadInput('session', huge)).toHaveProperty('ok')
    expect(await store.readGiven('session', huge)).toEqual({ failure: 'invalidInput' })
    expect(events).toEqual([
      {
        kind: 'assembly_manifest',
        operation: 'readGiven',
        providerRevision: 'MF4',
        session: 'session',
        result: 'invalidInput',
        head: 0,
        stage: 'head_range',
        requestedHeadOmitted: true,
        resourceEnded: true,
      },
    ])
    expect(failures).toEqual([{ kind: 'manifest_diagnostic_unavailable' }])
    expect(JSON.stringify(events)).not.toContain('999999')
    expect(JSON.stringify(events)).not.toContain('error message')
    expect(await store.readGiven('session', undefined)).toEqual({ failure: 'invalidInput' })
    expect(events).toHaveLength(1)
    await store.close()
  })
})

test('both borrowed diagnostic outputs may throw without replacing a commit or the original defect', async () => {
  await database(async storage => {
    const store = createAssemblyManifestStore(storage, {
      diagnostic() {
        throw new Error('first output failed')
      },
      diagnosticFailure() {
        throw new Error('second output failed')
      },
    })
    // This proves only business-result isolation. The assembly's actual separate
    // degradation state and query are an independent acceptance obligation.
    expect(await store.append('session', 0, input(1, 'given'))).toHaveProperty('seq', 1)
    expect(await store.readGiven('session', 1)).toHaveProperty('record.evaluationRef', 'given_a')
    const defect = new StorageDefect('original underlying defect')
    const read = vi.spyOn(storage, 'read').mockRejectedValueOnce(defect)
    await expect(store.readGiven('session', 1)).rejects.toBe(defect)
    read.mockRestore()
    await store.close()
  })
})
