import { expect, test } from 'vitest'
import {
  narrow,
  StorageUnavailable,
  UniqueViolation,
  type Storage,
} from '@omne-harness-lite/storage'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely'
import { runtimeContextMigrations } from '../src/migrations.ts'
import { createProjectionStore } from '../src/projection-store.ts'
import { projectContext } from '../src/projection.ts'
import type { ProjectionTables } from '../src/projection-codec.ts'
import { scope, seed, host, init, reader } from './fixture.ts'

async function state(h: Awaited<ReturnType<typeof host>>) {
  const prefix = await h.log.readSince(scope.session, 0)
  if ('failure' in prefix) throw new Error('fixture log unavailable')
  return projectContext(scope, prefix.entries, prefix.tail)
}
async function rows(storage: Storage) {
  return storage.read(async tx => ({
    meta: await narrow<ProjectionTables>(tx).selectFrom('rc_projection_meta').selectAll().execute(),
    entries: await narrow<ProjectionTables>(tx)
      .selectFrom('rc_projection_entries')
      .selectAll()
      .execute(),
  }))
}

test('Postgres migration compilation names both primary keys with the canonical identities', async () => {
  const statements: string[] = []
  const db = new Kysely<ProjectionTables>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: database => new PostgresIntrospector(database),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log(event) {
      if (event.level === 'query') statements.push(event.query.sql)
    },
  })
  try {
    for (const fragment of runtimeContextMigrations) await fragment.migration.up(db)
    expect(statements).toHaveLength(2)
    expect(statements[0]).toContain('constraint "rc_projection_meta_pkey" primary key')
    expect(statements[1]).toContain('constraint "rc_projection_entries_pkey" primary key')
  } finally {
    await db.destroy()
  }
})

test('real SQLite projection primary key failures expose the canonical constraint identities', async () => {
  const h = await host()
  try {
    await init(h)
    const stored = await rows(h.storage)
    await expect(
      h.storage.write(tx =>
        narrow<ProjectionTables>(tx)
          .insertInto('rc_projection_meta')
          .values(stored.meta[0]!)
          .execute(),
      ),
    ).rejects.toEqual(new UniqueViolation('rc_projection_meta_pkey'))
    await expect(
      h.storage.write(tx =>
        narrow<ProjectionTables>(tx)
          .insertInto('rc_projection_entries')
          .values(stored.entries[0]!)
          .execute(),
      ),
    ).rejects.toEqual(new UniqueViolation('rc_projection_entries_pkey'))
    expect(await rows(h.storage)).toEqual(stored)
  } finally {
    await h.close()
  }
})

test('a real SQLite transaction rolls back both progress and entries, then retries the original batch', async () => {
  const h = await host()
  try {
    await init(h)
    const before = await rows(h.storage)
    let fail = true
    const store = createProjectionStore({
      read: fn => h.storage.read(fn),
      write: fn =>
        h.storage.write(async tx => {
          const value = await fn(tx)
          if (fail) {
            fail = false
            throw new StorageUnavailable('inside transaction cutpoint')
          }
          return value
        }),
    })
    const basis = await store.load(scope),
      next = { ...(await state(h)), tail: 2 }
    await expect(store.save(scope, basis, next)).rejects.toThrow('inside transaction cutpoint')
    expect(await rows(h.storage)).toEqual(before)
    expect(store.unresolved).toBe(1)
    expect((await store.load(scope)).state?.tail).toBe(2)
    expect(store.unresolved).toBe(0)
  } finally {
    await h.close()
  }
})

test('lost SQL receipt retains the exact batch, recognizes committed Unicode keys, and cannot overwrite a later generation', async () => {
  const h = await host()
  try {
    await init(h)
    let lose = false
    const store = createProjectionStore({
      read: fn => h.storage.read(fn),
      async write(fn) {
        const value = await h.storage.write(fn)
        if (lose) {
          lose = false
          throw new StorageUnavailable('after physical commit')
        }
        return value
      },
    })
    const basis = await store.load(scope),
      initial = await state(h)
    const registrations = new Map(initial.registrations)
    for (const key of ['Z', 'a', 'é', '中'])
      registrations.set(key, { ...seed.required[0]!, key, required: false })
    lose = true
    await expect(store.save(scope, basis, { ...initial, registrations, tail: 2 })).rejects.toThrow(
      'after physical commit',
    )
    const committed = await rows(h.storage)
    expect((await store.load(scope)).state?.registrations.size).toBe(5)
    expect(await rows(h.storage)).toEqual(committed)
    const fresh = await store.load(scope)
    expect(await store.save(scope, fresh, { ...initial, tail: 3 })).toBe(true)
    expect(await store.save(scope, basis, { ...initial, tail: 1 })).toBe(false)
    expect((await store.load(scope)).state?.tail).toBe(3)
  } finally {
    await h.close()
  }
})

test('meta survives the last removal and tenant identity separates equal session/key rows', async () => {
  const h = await host()
  try {
    await init(h)
    const store = createProjectionStore(h.storage),
      original = await state(h)
    const empty = {
      ...original,
      registrations: new Map(),
      contents: new Map(),
      registrationRevision: 'removed-last',
    }
    expect(await store.save(scope, await store.load(scope), empty)).toBe(true)
    expect((await store.load(scope)).state).toMatchObject({ registrationRevision: 'removed-last' })
    expect((await rows(h.storage)).entries).toHaveLength(0)
    const parsed = parseTenantId({ organization: 'org', account: 'bob' })
    if (!('ok' in parsed)) throw new Error('fixture invalid')
    const other = { ...scope, tenant: parsed.ok }
    expect(await store.save(other, await store.load(other), original)).toBe(true)
    expect((await store.load(other)).state?.registrations.size).toBe(1)
    expect((await store.load(scope)).state?.registrations.size).toBe(0)
    expect((await rows(h.storage)).meta).toHaveLength(2)
  } finally {
    await h.close()
  }
})

test('removing the last optional public registration preserves its CAS revision across a new owner', async () => {
  const h = await host()
  try {
    const initial = await h.initializer.initializeContextSession(scope, {
      required: [],
      initial: [],
      fixed: [],
    })
    if (initial.kind !== 'applied') throw new Error('empty initialization failed')
    const registered = await h.owner.operations.register(
      h.access,
      scope,
      {
        ...seed.required[0]!,
        key: 'public',
        required: false,
      },
      initial.revision,
    )
    if (registered.kind !== 'applied') throw new Error('optional registration failed')
    const removed = await h.owner.operations.remove(h.access, scope, 'public', registered.revision)
    if (removed.kind !== 'applied') throw new Error('last optional removal failed')
    const stored = await rows(h.storage)
    expect(stored.entries).toEqual([])
    expect(stored.meta[0]?.registration_revision).toBe(removed.revision)
    h.owner.closeAdmission()
    await h.owner.drain()
    const { createRuntimeContext } = await import('../src/index.ts')
    const next = createRuntimeContext({
      storage: h.storage,
      log: h.log,
      access: h.auth.operations,
      now: async () => '2026-10-04T00:00:00Z',
    })
    next.sources.registerSource({
      name: 'session',
      recovery: 'persisted',
      consumers: ['model', 'tool', 'extension'],
      requiredKeys: [],
      read: async () => ({ kind: 'values', values: [] }),
    })
    try {
      expect(await next.operations.registrations(h.access, scope)).toEqual({
        kind: 'registrations',
        entries: [],
        revision: removed.revision,
      })
      expect(
        await next.operations.register(
          h.access,
          scope,
          { ...seed.required[0]!, key: 'public', required: false },
          registered.revision,
        ),
      ).toMatchObject({ reason: 'revisionConflict' })
      expect(
        await next.operations.register(
          h.access,
          scope,
          { ...seed.required[0]!, key: 'public', required: false },
          removed.revision,
        ),
      ).toHaveProperty('kind', 'applied')
    } finally {
      next.closeAdmission()
      await next.drain()
    }
  } finally {
    await h.close()
  }
})

test('a business append followed by an unknown SQL receipt never returns stale data or appends another business event', async () => {
  let lose = false
  const h = await host(undefined, physical => ({
    read: fn => physical.read(fn),
    async write(fn) {
      const value = await physical.write(fn)
      if (lose) {
        lose = false
        throw new StorageUnavailable('lost projection receipt')
      }
      return value
    },
  }))
  try {
    const initial = await init(h)
    lose = true
    expect(
      await h.owner.operations.register(
        h.access,
        scope,
        { ...seed.required[0]!, key: 'public', required: false },
        initial,
      ),
    ).toMatchObject({
      reason: 'unavailable',
    })
    const before = await h.log.readSince(scope.session, 0)
    expect(await h.owner.operations.registrations(h.access, scope)).toMatchObject({
      entries: [{ key: 'identity' }, { key: 'public' }],
    })
    expect(await h.log.readSince(scope.session, 0)).toEqual(before)
    expect(await (await reader(h)).read(['identity'])).toMatchObject({
      kind: 'values',
      values: [{ key: 'identity' }],
    })
  } finally {
    await h.close()
  }
})

test('missing or obsolete SQL projection is rebuilt from the real log without a new context event', async () => {
  const h = await host()
  try {
    await init(h)
    const before = await h.log.readSince(scope.session, 0)
    await h.storage.write(async tx => {
      await narrow<ProjectionTables>(tx)
        .updateTable('rc_projection_meta')
        .set({ fold_version: 'obsolete' })
        .execute()
    })
    expect(await (await reader(h)).read(['identity'])).toHaveProperty('kind', 'values')
    expect((await rows(h.storage)).meta[0]?.fold_version).toBe('1')
    await h.storage.write(async tx => {
      await narrow<ProjectionTables>(tx)
        .updateTable('rc_projection_entries')
        .set({ content: '{invalid' })
        .execute()
    })
    expect(await (await reader(h)).read(['identity'])).toMatchObject({
      kind: 'values',
      values: [{ key: 'identity' }],
    })
    await h.storage.write(async tx => {
      await narrow<ProjectionTables>(tx).deleteFrom('rc_projection_entries').execute()
      await narrow<ProjectionTables>(tx).deleteFrom('rc_projection_meta').execute()
    })
    expect(await (await reader(h)).read(['identity'])).toHaveProperty('kind', 'values')
    expect(await h.log.readSince(scope.session, 0)).toEqual(before)
  } finally {
    await h.close()
  }
})
