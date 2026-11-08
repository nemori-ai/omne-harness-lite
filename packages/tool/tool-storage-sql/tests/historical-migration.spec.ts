import { readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createLocalHistoricalDeliveryMaintenance } from '@omne-harness/tool-host-local'
import {
  encodeToolMaterial,
  createToolHistoryMigration,
  type ToolHistoryMigrationOptions,
} from '@omne-harness/tool'
import { decodeToolCallId, decodeToolOperationId } from '@omne-harness/tool-contract'
import {
  decodeToolMaterialInstant,
  decodeToolResultVersion,
  defaultResultPolicy,
} from '@omne-harness/tool-contract/provider'
import {
  createSqlToolGuardedHostCommit,
  createSqlToolHistoryLedgerStore,
  createSqlToolHistoryCopies,
  createSqlToolMaterialStore,
} from '../src/index.ts'
import { openApp, TENANT_A, TENANT_B, domainNameOf, type App } from './fixtures/app.ts'
import { ledgerWorld, type Principal } from './fixtures/ledger.ts'

const fixture: {
  tables: Record<string, readonly Record<string, string | number>[]>
  native: { key: string; base64: string }
  consumer: unknown
} = JSON.parse(
  readFileSync(new URL('./fixtures/pre-w3-drained-ordinary.json', import.meta.url), 'utf8'),
)
const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})
const provider = {
  owner: 'history-test',
  name: 'materials',
  revision: '1',
  digest: 'sha256:materials',
}
const adoption = {
  owner: 'history-test',
  name: 'migration',
  revision: '1',
  digest: 'sha256:migration',
}
function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}
async function historicalApp() {
  const app = await openApp()
  opened.push(app)
  const database = new DatabaseSync(join(app.directory, `${domainNameOf(TENANT_A)}.db`))
  try {
    for (const table of ['tl_domain', 'tl_record', 'tl_manifest', 'tl_chunk']) {
      for (const row of fixture.tables[table] ?? []) {
        const columns = Object.keys(row)
        database
          .prepare(
            `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          )
          .run(
            ...columns.map(key =>
              table === 'tl_chunk' && key === 'data'
                ? Buffer.from(String(row[key]), 'base64')
                : row[key]!,
            ),
          )
      }
    }
  } finally {
    database.close()
  }
  writeFileSync(
    join(app.directory, fixture.native.key),
    Buffer.from(fixture.native.base64, 'base64'),
  )
  writeFileSync(join(app.directory, 'consumer.json'), JSON.stringify(fixture.consumer))
  return app
}

async function migrationWorld() {
  const app = await historicalApp()
  const world = await ledgerWorld(TENANT_A)
  const access = { ...world.access, call: ok(decodeToolCallId('legacy-ordinary')) }
  const materialPorts = {
    provider,
    store: createSqlToolMaterialStore<Principal>({ ...app.custodyOptions(), provider }),
    clock: {
      sample: async () => succeed(ok(decodeToolMaterialInstant('2026-11-08T00:00:00.000Z'))),
    },
  }
  const options: ToolHistoryMigrationOptions<Principal> = {
    adoption,
    store: createSqlToolHistoryLedgerStore(app.options),
    authority: { qualify: async () => succeed(undefined) },
    materials: materialPorts,
    copies: createSqlToolHistoryCopies<Principal>(app.options),
    resultPolicy: defaultResultPolicy,
    configuration: {
      ledgerCommitAttempts: 4,
      readResultArguments: {
        maxBytes: 65536,
        maxDepth: 32,
        maxItems: 4096,
        maxMembers: 256,
        maxStringLength: 32768,
        maxNumberLength: 64,
      },
      offloading: {
        maxInlineUtf8Bytes: 65536,
        maxRetentionMs: 86400000,
        maxBodyBytes: 16777216,
        previewUtf8Bytes: 1024,
        maxPageBytes: 65536,
        maxPageLeaseMs: 30000,
        maxWriterMetadataBytes: 1048576,
        jsonDocument: {
          maxBytes: 1048576,
          maxDepth: 64,
          maxItems: 65536,
          maxMembers: 65536,
          maxStringLength: 1048576,
          maxNumberLength: 64,
        },
        jsonRecord: {
          maxBytes: 65536,
          maxDepth: 32,
          maxItems: 4096,
          maxMembers: 4096,
          maxStringLength: 65536,
          maxNumberLength: 64,
        },
      },
    },
  }
  return {
    app,
    access,
    world,
    materialPorts,
    options,
    migration: createToolHistoryMigration(options),
  }
}

it('converts and cleans a real drained ordinary result while retaining native and consumer data', async () => {
  const { app, access, world, materialPorts, migration } = await migrationWorld()
  const preview = ok(await migration.preview({ ...access, interpretations: [] }))
  expect(preview, JSON.stringify(preview)).toMatchObject({ kind: 'ready' })
  if (preview.kind !== 'ready') throw new Error('ordinary historical result must be migratable')
  const command = {
    ...access,
    operation: ok(decodeToolOperationId('migrate-ordinary')),
    source: preview.source,
    interpretations: [],
  }
  const published = ok(await migration.apply(command))
  expect(['published', 'cleaned']).toContain(published.kind)
  const ledger = world.ledgerOver(app.store, materialPorts)
  await expect(
    ledger.reads.result({ ...access, result: ok(decodeToolResultVersion('v1')), after: null }),
  ).resolves.toMatchObject({
    failure: { kind: 'not-found', target: 'result', reason: 'released' },
  })
  await expect(migration.inspect(command)).resolves.toMatchObject({
    ok: { operation: command.operation },
  })
  const cleaned = ok(await migration.apply(command))
  expect(cleaned.kind).toBe('cleaned')
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT operation FROM tl_chunk WHERE call = 'legacy-ordinary'",
    ),
  ).toEqual([])
  const manifests = app.sqlite.inspect(
    domainNameOf(TENANT_A),
    "SELECT answer FROM tl_manifest WHERE call = 'legacy-ordinary'",
  )
  expect(manifests).toHaveLength(2)
  for (const row of manifests)
    expect(JSON.parse(String(row.answer))).toMatchObject({
      kind: 'history-copy-cleanup',
      state: 'deleted',
    })
  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (ok(await ledger.maintenance.reclaim(access)).kind === 'idle') break
  }
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT material FROM tl_material_chunk WHERE call = 'legacy-ordinary'",
    ),
  ).toEqual([])
  const hostBefore = app.sqlite.inspect(
    domainNameOf(TENANT_A),
    "SELECT record FROM tl_record WHERE kind = 'host'",
  )
  expect(JSON.stringify(hostBefore)).toContain('ordinary answer')
  const host = createLocalHistoricalDeliveryMaintenance({
    store: app.store,
    guarded: createSqlToolGuardedHostCommit(app.options),
    authority: { qualify: async () => succeed(undefined) },
    commitAttempts: 4,
  })
  await expect(host.compact(command)).resolves.toEqual({ ok: { kind: 'compacted', records: 1 } })
  const hostAfter = app.sqlite.inspect(
    domainNameOf(TENANT_A),
    "SELECT record FROM tl_record WHERE kind = 'host'",
  )
  expect(JSON.stringify(hostAfter)).not.toContain('ordinary answer')
  const old = JSON.parse(String(hostBefore[0]!.record)).host.value
  const compacted = JSON.parse(String(hostAfter[0]!.record)).host.value
  expect(compacted).toMatchObject({
    phase: old.phase,
    release: old.release,
    freeze: old.freeze,
    done: old.done,
    historical: { payloadDigest: old.digest },
  })
  expect(compacted.payload.consumer).toEqual(old.payload.consumer)
  await expect(host.compact(command)).resolves.toEqual({ ok: { kind: 'compacted', records: 0 } })
  const replay = ok(await migration.apply(command))
  expect(replay).toEqual(cleaned)

  expect(readFileSync(join(app.directory, fixture.native.key))).toEqual(
    Buffer.from(fixture.native.base64, 'base64'),
  )
  expect(JSON.parse(readFileSync(join(app.directory, 'consumer.json'), 'utf8'))).toEqual(
    fixture.consumer,
  )
})

async function previewCommand(
  migration: ReturnType<typeof createToolHistoryMigration<Principal>>,
  access: Awaited<ReturnType<typeof migrationWorld>>['access'],
) {
  const preview = ok(await migration.preview({ ...access, interpretations: [] }))
  if (preview.kind !== 'ready') throw new Error(JSON.stringify(preview))
  return {
    ...access,
    operation: ok(decodeToolOperationId('migrate-ordinary')),
    source: preview.source,
    interpretations: [],
  }
}

it('does not delete old copies before publication or when the proposed manifest differs', async () => {
  const { app, access, migration, options } = await migrationWorld()
  const command = await previewCommand(migration, access)
  const copies = ok(await options.copies.inventory(access)).copies
  const copy = copies[0]!
  const basis = { owner: 'unpublished', record: 'fake', revision: '1', digest: 'sha256:fake' }
  await expect(
    options.copies.cleanup({
      ...command,
      copy,
      publication: basis,
      expected: command.source.revision,
    }),
  ).resolves.toMatchObject({ failure: { kind: 'conflict' } })
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT operation FROM tl_chunk WHERE call = 'legacy-ordinary'",
    ),
  ).toHaveLength(2)
  const publication = ok(await migration.apply(command))
  if (publication.kind !== 'published') throw new Error('expected publication')
  const state = await options.store.read({ kind: 'call', tenant: access.tenant, call: access.call })
  if (state.kind !== 'complete') throw new Error('read failed')
  await expect(
    options.copies.cleanup({
      ...command,
      copy: { ...copy, sha256: '0'.repeat(64) },
      publication: publication.receipt,
      expected: state.revision,
    }),
  ).resolves.toMatchObject({ failure: { kind: 'conflict' } })
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT operation FROM tl_chunk WHERE call = 'legacy-ordinary'",
    ),
  ).toHaveLength(2)
})

it('recalls a publication whose reply was lost without changing its activation time', async () => {
  const { access, options, migration } = await migrationWorld()
  const command = await previewCommand(migration, access)
  let published = false
  const interrupted = createToolHistoryMigration({
    ...options,
    store: {
      ...options.store,
      commit: async input => {
        const answer = await options.store.commit(input)
        if (
          !published &&
          answer.kind === 'committed' &&
          input.writes.some(
            write =>
              write.kind === 'put' &&
              write.record.kind === 'history-migration' &&
              write.record.migration.progress.kind === 'published',
          )
        ) {
          published = true
          return { kind: 'unknown', diagnostic: 'lost reply' }
        }
        return answer
      },
    },
  })
  await expect(interrupted.apply(command)).resolves.toMatchObject({
    failure: { kind: 'commit-unknown', operation: command.operation },
  })
  const before = ok(await migration.inspect(command))
  if (before.kind !== 'published') throw new Error('publication was not retained')
  const restarted = createToolHistoryMigration(options)
  const after = ok(await restarted.apply(command))
  expect(after).toMatchObject({
    kind: 'cleaned',
    receipt: before.receipt,
    activatedAt: before.activatedAt,
  })
  await expect(restarted.abandon(command)).resolves.toMatchObject({ failure: { kind: 'conflict' } })
})

it('abandons only its prepared materials and does not publish or delete the old result', async () => {
  const { app, access, options, migration } = await migrationWorld()
  const command = await previewCommand(migration, access)
  const interrupted = createToolHistoryMigration({
    ...options,
    materials: {
      ...options.materials,
      store: {
        ...options.materials.store,
        write: async () => ({
          failure: { kind: 'unavailable', dependency: 'test-write', diagnostic: 'interrupted' },
        }),
      },
    },
  })
  await expect(interrupted.apply(command)).resolves.toMatchObject({
    failure: { kind: 'unavailable' },
  })
  const abandoning = ok(await migration.abandon(command))
  expect(abandoning.kind).toBe('abandoning')
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (ok(await migration.abandon(command)).kind === 'abandoned') break
  }
  await expect(migration.inspect(command)).resolves.toMatchObject({ ok: { kind: 'abandoned' } })
  await expect(migration.apply(command)).resolves.toMatchObject({ failure: { kind: 'conflict' } })
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT operation FROM tl_chunk WHERE call = 'legacy-ordinary'",
    ),
  ).toHaveLength(2)
  await expect(
    app.store.read({ kind: 'call', tenant: access.tenant, call: access.call }),
  ).resolves.toMatchObject({ kind: 'unavailable' })
})

it('fences a seal that returns after abandonment has reclaimed its staged bytes', async () => {
  const { app, access, options, migration } = await migrationWorld()
  const command = await previewCommand(migration, access)
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const delayed = createToolHistoryMigration({
    ...options,
    materials: {
      ...options.materials,
      store: {
        ...options.materials.store,
        write: async input => {
          const written = await options.materials.store.write(input)
          entered.resolve()
          await resume.promise
          return written
        },
      },
    },
  })
  const running = delayed.apply(command)
  await entered.promise
  try {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (ok(await migration.abandon(command)).kind === 'abandoned') break
    }
    await expect(migration.inspect(command)).resolves.toMatchObject({ ok: { kind: 'abandoned' } })
  } finally {
    resume.resolve()
  }
  await expect(running).resolves.toMatchObject({ failure: { kind: 'conflict' } })
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT material FROM tl_material_chunk WHERE call = 'legacy-ordinary'",
    ),
  ).toEqual([])
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT operation FROM tl_chunk WHERE call = 'legacy-ordinary'",
    ),
  ).toHaveLength(2)
})

it.each(['request', 'tenant', 'acknowledgement', 'unknown-copy', 'result-key'])(
  'quarantines an unproved historical %s without changing any rows',
  async problem => {
    const { app, access, migration } = await migrationWorld()
    const db = new DatabaseSync(join(app.directory, `${domainNameOf(TENANT_A)}.db`))
    try {
      if (problem === 'result-key') {
        db.prepare(
          "UPDATE tl_record SET key = 'result:wrong-version' WHERE key = 'result:v1'",
        ).run()
      } else if (problem === 'unknown-copy') {
        db.prepare(
          "INSERT INTO tl_chunk (tenant, call, operation, idx, data) SELECT tenant, call, 'unknown-copy', idx, data FROM tl_chunk LIMIT 1",
        ).run()
      } else {
        const key = problem === 'acknowledgement' ? 'fact-batch:%' : 'call'
        const row = db
          .prepare("SELECT key, record FROM tl_record WHERE kind = 'call' AND key LIKE ? LIMIT 1")
          .get(key)!
        const value = JSON.parse(String(row.record))
        if (problem === 'request') value.call.request.arguments.complete = 'yes'
        else if (problem === 'tenant')
          value.call.tenant.account.text = 'acc_33333333333333333333333333'
        else value.batch.acknowledgement = { kind: 'pending' }
        db.prepare("UPDATE tl_record SET record = ? WHERE kind = 'call' AND key = ?").run(
          JSON.stringify(value),
          String(row.key),
        )
      }
    } finally {
      db.close()
    }
    const before = app.sqlite.inspect(
      domainNameOf(TENANT_A),
      'SELECT record FROM tl_record ORDER BY key',
    )
    await expect(migration.preview({ ...access, interpretations: [] })).resolves.toMatchObject({
      ok: { kind: 'quarantined' },
    })
    expect(
      app.sqlite.inspect(domainNameOf(TENANT_A), 'SELECT record FROM tl_record ORDER BY key'),
    ).toEqual(before)
  },
)

it('does not commit a late seal after the abandoning fence even before physical deletion', async () => {
  const { access, options, migration } = await migrationWorld()
  const command = await previewCommand(migration, access)
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const delayed = createToolHistoryMigration({
    ...options,
    materials: {
      ...options.materials,
      store: {
        ...options.materials.store,
        write: async input => {
          const written = await options.materials.store.write(input)
          entered.resolve()
          await resume.promise
          return written
        },
      },
    },
  })
  const running = delayed.apply(command)
  await entered.promise
  let before
  try {
    expect(ok(await migration.abandon(command)).kind).toBe('abandoning')
    before = await options.store.read({ kind: 'call', tenant: access.tenant, call: access.call })
  } finally {
    resume.resolve()
  }
  await expect(running).resolves.toMatchObject({ failure: { kind: 'conflict' } })
  expect(
    await options.store.read({ kind: 'call', tenant: access.tenant, call: access.call }),
  ).toEqual(before)
})

it('preserves the fingerprint of the original submitted fact batch, excluding acknowledgement metadata', async () => {
  const { app, access, migration } = await migrationWorld()
  const before = app.sqlite
    .inspect(
      domainNameOf(TENANT_A),
      "SELECT record FROM tl_record WHERE key LIKE 'fact-batch:%' OR key LIKE 'fact-event:%'",
    )
    .map(row => JSON.parse(String(row.record)))
  const batch = before.find(row => row.kind === 'fact-batch').batch
  const original = {
    start: batch.start,
    source: batch.source,
    batch: batch.batch,
    after: batch.after,
    cursor: batch.cursor,
    events: batch.events.map((event: string) => ({
      event,
      fact: before.find(row => row.kind === 'fact-event' && row.fact.event === event).fact.fact,
    })),
  }
  const expected = ok(encodeToolMaterial(original)).fingerprint
  ok(await migration.apply(await previewCommand(migration, access)))
  const after = app.sqlite.inspect(
    domainNameOf(TENANT_A),
    "SELECT record FROM tl_record WHERE key LIKE 'fact-batch:%'",
  )
  expect(JSON.parse(String(after[0]!.record)).batch.value).toEqual(expected)
  expect(JSON.parse(String(after[0]!.record)).batch.acknowledgement).toEqual(batch.acknowledgement)
})

it('does not publish after maintenance authority is revoked during the activation clock sample', async () => {
  const { app, access, options, migration } = await migrationWorld()
  const command = await previewCommand(migration, access)
  let revoked = false
  const guarded = createToolHistoryMigration({
    ...options,
    authority: {
      qualify: async () =>
        revoked
          ? fail({ kind: 'unavailable', dependency: 'test-authority', diagnostic: 'revoked' })
          : succeed(undefined),
    },
    materials: {
      ...options.materials,
      clock: {
        sample: async () => {
          const state = await options.store.read({
            kind: 'call',
            tenant: access.tenant,
            call: access.call,
          })
          if (
            state.kind === 'complete' &&
            state.records.filter(
              row =>
                row.record &&
                typeof row.record === 'object' &&
                'kind' in row.record &&
                row.record.kind === 'material',
            ).length === 3
          )
            revoked = true
          return options.materials.clock.sample()
        },
      },
    },
  })
  await expect(guarded.apply(command)).resolves.toMatchObject({
    failure: { dependency: 'test-authority' },
  })
  expect(revoked).toBe(true)
  expect(ok(await migration.inspect(command)).kind).toBe('preparing')
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT operation FROM tl_chunk WHERE call = 'legacy-ordinary'",
    ),
  ).toHaveLength(2)
})

it('recalls host compaction after a committed transaction throws instead of returning its receipt', async () => {
  const { app, access, migration } = await migrationWorld()
  const command = await previewCommand(migration, access)
  ok(await migration.apply(command))
  const guarded = createSqlToolGuardedHostCommit(app.options)
  let lose = true
  const host = createLocalHistoricalDeliveryMaintenance({
    store: app.store,
    authority: { qualify: async () => succeed(undefined) },
    commitAttempts: 4,
    guarded: {
      commit: async input => {
        const result = await guarded.commit(input)
        if (lose && result.kind === 'committed') {
          lose = false
          throw new Error('reply lost')
        }
        return result
      },
    },
  })
  await expect(host.compact(command)).resolves.toMatchObject({
    failure: { kind: 'commit-unknown', operation: command.operation },
  })
  await expect(host.compact(command)).resolves.toEqual({ ok: { kind: 'compacted', records: 0 } })
})

it('rejects a stale preview before preparing materials and never migrates another tenant through it', async () => {
  const { app, access, migration } = await migrationWorld()
  const command = await previewCommand(migration, access)
  await expect(migration.apply({ ...command, tenant: TENANT_B })).resolves.toMatchObject({
    failure: { kind: 'conflict' },
  })
  const db = new DatabaseSync(join(app.directory, `${domainNameOf(TENANT_A)}.db`))
  try {
    const row = db.prepare("SELECT record FROM tl_record WHERE key = 'call'").get()!
    const record = JSON.parse(String(row.record))
    record.call.request.reference = 'changed-after-preview'
    db.prepare("UPDATE tl_record SET record = ? WHERE key = 'call'").run(JSON.stringify(record))
  } finally {
    db.close()
  }
  await expect(migration.apply(command)).resolves.toMatchObject({ failure: { kind: 'conflict' } })
  expect(
    app.sqlite.inspect(domainNameOf(TENANT_A), 'SELECT material FROM tl_material_chunk'),
  ).toEqual([])
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT key FROM tl_record WHERE key LIKE 'history-migration:%'",
    ),
  ).toEqual([])
  expect(app.sqlite.inspect(domainNameOf(TENANT_A), 'SELECT operation FROM tl_chunk')).toHaveLength(
    2,
  )
})

it('recovers old-copy cleanup after the SQL transaction commits but its reply is lost', async () => {
  const { app, access, options, migration } = await migrationWorld()
  const command = await previewCommand(migration, access)
  const published = ok(await migration.apply(command))
  app.faults.armCommit('unknown-applied')
  await expect(migration.apply(command)).resolves.toMatchObject({
    failure: { kind: 'commit-unknown', operation: command.operation },
  })
  const restarted = createToolHistoryMigration(options)
  const cleaned = ok(await restarted.apply(command))
  expect(cleaned).toMatchObject({ ...published, kind: 'cleaned' })
  expect(app.sqlite.inspect(domainNameOf(TENANT_A), 'SELECT operation FROM tl_chunk')).toEqual([])
})
