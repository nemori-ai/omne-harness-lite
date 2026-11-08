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
  type HistoricalTextInterpretation,
} from '@omne-harness/tool'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type ContentPage,
} from '@omne-harness/tool-contract'
import {
  decodeToolMaterialInstant,
  decodeToolResultVersion,
  defaultResultPolicy,
} from '@omne-harness/tool-contract/provider'
import {
  createSqlToolGuardedHostCommit,
  createSqlToolHistoryLedgerStore,
  createSqlToolHistoryCopies,
  createSqlToolHistorySourceReader,
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
const offloadedFixture: typeof fixture = JSON.parse(
  readFileSync(new URL('./fixtures/pre-w3-drained-offloaded.json', import.meta.url), 'utf8'),
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
async function historicalApp(selected = fixture) {
  const app = await openApp()
  opened.push(app)
  const database = new DatabaseSync(join(app.directory, `${domainNameOf(TENANT_A)}.db`))
  try {
    for (const table of ['tl_domain', 'tl_record', 'tl_manifest', 'tl_chunk']) {
      for (const row of selected.tables[table] ?? []) {
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
    join(app.directory, selected.native.key),
    Buffer.from(selected.native.base64, 'base64'),
  )
  writeFileSync(join(app.directory, 'consumer.json'), JSON.stringify(selected.consumer))
  return app
}

async function migrationWorld(selected = fixture, call = 'legacy-ordinary') {
  const app = await historicalApp(selected)
  const world = await ledgerWorld(TENANT_A)
  const access = { ...world.access, call: ok(decodeToolCallId(call)) }
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
    sourceReader: createSqlToolHistorySourceReader<Principal>(app.options),
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

it('discovers a saved original migration after an unknown preparation commit', async () => {
  const { app, access, options, migration } = await migrationWorld()
  expect(ok(await migration.plans(access))).toEqual([])
  const preview = ok(await migration.preview({ ...access, interpretations: [] }))
  if (preview.kind !== 'ready') throw new Error('historical fixture is not ready')
  const command = {
    ...access,
    operation: ok(decodeToolOperationId('recover-original-plan')),
    source: preview.source,
    interpretations: [],
  }
  app.faults.armCommit('unknown-applied')
  expect(await migration.apply(command)).toHaveProperty('failure.kind', 'commit-unknown')
  const restarted = createToolHistoryMigration(options)
  const plans = ok(await restarted.plans(access))
  expect(plans).toEqual([
    {
      progress: { kind: 'preparing', operation: command.operation, source: preview.source },
      interpretations: [],
    },
  ])
  const restored = plans[0]!
  expect(
    ok(
      await restarted.apply({
        ...access,
        operation: restored.progress.operation,
        source: restored.progress.source,
        interpretations: restored.interpretations,
      }),
    ),
  ).toMatchObject({ kind: 'published', operation: command.operation })
  expect(ok(await restarted.plans(access))[0]?.progress.kind).toBe('published')
  expect(ok(await restarted.apply(command)).kind).toBe('cleaned')
  expect(ok(await restarted.plans(access))[0]?.progress.kind).toBe('cleaned')
  const raw = app.sqlite.inspect(
    domainNameOf(TENANT_A),
    "SELECT record FROM tl_record WHERE kind = 'call' AND key = ?",
    [`history-migration:${command.operation}`],
  )[0]
  const damaged = JSON.parse(String(raw?.record))
  damaged.migration.progress.operation = 'another-operation'
  app.sqlite.inspect(
    domainNameOf(TENANT_A),
    "UPDATE tl_record SET record = ? WHERE kind = 'call' AND key = ?",
    [JSON.stringify(damaged), `history-migration:${command.operation}`],
  )
  expect(await restarted.plans(access)).toHaveProperty('failure.kind', 'invalid')
})

it('does not disclose migration plans after authority is withdrawn during the read', async () => {
  const { access, options } = await migrationWorld()
  let revoked = false
  const migration = createToolHistoryMigration({
    ...options,
    authority: {
      qualify: async () =>
        revoked ? fail({ kind: 'denied', action: 'history-upgrade' }) : succeed(undefined),
    },
    store: {
      ...options.store,
      read: async input => {
        const answer = await options.store.read(input)
        revoked = true
        return answer
      },
    },
  })
  expect(await migration.plans(access)).toHaveProperty('failure.kind', 'denied')
})

it('checks orphan host deliveries independently of the call inventory and preserves read failure', async () => {
  const { app, access } = await migrationWorld()
  app.sqlite.inspect(domainNameOf(TENANT_A), "DELETE FROM tl_record WHERE kind = 'call'")
  app.sqlite.inspect(domainNameOf(TENANT_A), "DELETE FROM tl_domain WHERE kind = 'call'")
  const host = createLocalHistoricalDeliveryMaintenance({
    store: app.store,
    guarded: createSqlToolGuardedHostCommit(app.options),
    authority: { qualify: async () => succeed(undefined) },
    commitAttempts: 4,
  })
  expect(await host.inspect(access)).toEqual({ ok: { kind: 'quarantined' } })
  app.faults.failNextRead()
  expect(await host.inspect(access)).toHaveProperty('failure.kind', 'unavailable')
})

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
  await expect(host.inspect(access)).resolves.toEqual({ ok: { kind: 'quarantined' } })
  await expect(host.compact(command)).resolves.toEqual({ ok: { kind: 'compacted', records: 1 } })
  await expect(host.inspect(access)).resolves.toEqual({ ok: { kind: 'current', records: 1 } })
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
  interpretations: readonly HistoricalTextInterpretation[] = [],
) {
  const preview = ok(await migration.preview({ ...access, interpretations }))
  if (preview.kind !== 'ready') throw new Error(JSON.stringify(preview))
  return {
    ...access,
    operation: ok(decodeToolOperationId('migrate-ordinary')),
    source: preview.source,
    interpretations,
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

it.each(['ordinary', 'offloaded'])(
  'recalls a %s publication whose reply was lost without changing its activation time',
  async kind => {
    const { app, access, options, materialPorts, migration } = await migrationWorld(
      kind === 'ordinary' ? fixture : offloadedFixture,
      'legacy-' + kind,
    )
    const command = await previewCommand(
      migration,
      access,
      kind === 'ordinary' ? [] : historicalBodyInput().interpretations,
    )
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
    materialPorts.clock.sample = async () =>
      succeed(ok(decodeToolMaterialInstant('2026-11-08T12:00:00.000Z')))
    const restarted = createToolHistoryMigration(options)
    const after = ok(await restarted.apply(command))
    expect(after).toMatchObject({
      kind: 'cleaned',
      receipt: before.receipt,
      activatedAt: before.activatedAt,
    })
    if (kind === 'offloaded') {
      const state = await app.store.read({ kind: 'call', tenant: access.tenant, call: access.call })
      if (state.kind !== 'complete') throw new Error('missing call')
      const result = state.records.find(row => row.kind === 'result')
      if (result?.kind !== 'result' || result.result.value.original.kind !== 'offloaded')
        throw new Error('missing body')
      expect(result.result.value.original.body.description.retention).toMatchObject({
        activatedAt: before.activatedAt,
        expiresAt: '2026-11-09T00:00:00.000Z',
      })
    }
    await expect(restarted.abandon(command)).resolves.toMatchObject({
      failure: { kind: 'conflict' },
    })
  },
)

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

function historicalBodyInput() {
  const source = {
    storage: '@omne-harness/tool-storage-sql',
    key: '["legacy-offloaded","legacy-offloaded-raw"]',
    mediaType: 'application/octet-stream',
    bytes: '32799',
    digest: 'sha256:0e181505330f729abc31822c4f6cfb2f0192739af5e2b8c6a670464444c2cb2c',
  }
  const interpretations = [
    {
      tool: { owner: 'test-owner', name: 'read_file', revision: '1', digest: 'sha256:read_file' },
      rawCodec: {
        owner: 'test-owner',
        name: 'w3-migration-fixture-utf8-text-v1',
        revision: '1',
        digest: 'sha256:w3-migration-fixture-utf8-text-v1',
      },
      source,
      interpretation: adoption,
      representation: { kind: 'text' as const, codec: adoption },
      basis: {
        owner: 'history-test',
        record: 'utf8-source-proof',
        revision: '1',
        digest: 'sha256:fixture-utf8',
      },
    },
  ]
  return { source, interpretations }
}

it('migrates the real historical UTF-8 body and reads the old reference through the current body lifetime', async () => {
  const { app, access, options, materialPorts, world, migration } = await migrationWorld(
    offloadedFixture,
    'legacy-offloaded',
  )
  const { source, interpretations } = historicalBodyInput()
  await expect(migration.preview({ ...access, interpretations: [] })).resolves.toMatchObject({
    ok: { kind: 'quarantined', reason: 'encoding' },
  })
  const preview = ok(await migration.preview({ ...access, interpretations }))
  expect(preview).toMatchObject({ kind: 'ready', results: [{ body: 'finite-text' }] })
  if (preview.kind !== 'ready') throw new Error('expected a supported historical body')
  const command = {
    ...access,
    operation: ok(decodeToolOperationId('migrate-body')),
    source: preview.source,
    interpretations,
  }
  const published = ok(await migration.apply(command))
  expect(published.kind).toBe('published')
  const ledger = world.ledgerOver(app.store, materialPorts)
  const result = ok(decodeToolResultVersion('v1'))
  const read = { ...access, result, attachment: source, after: null, maxBytes: 4093 }
  await expect(
    ledger.reads.content.read({ ...read, principal: { subject: 'bob' } }),
  ).resolves.toMatchObject({ failure: { kind: 'denied' } })
  await expect(ledger.reads.content.read({ ...read, tenant: TENANT_B })).resolves.toMatchObject({
    failure: { kind: 'denied' },
  })
  await expect(ledger.reads.result({ ...access, result, after: null })).resolves.toMatchObject({
    failure: { kind: 'not-found', target: 'result', reason: 'released' },
  })
  await expect(
    ledger.reads.content.read({ ...read, after: 'legacy-cursor' }),
  ).resolves.toMatchObject({
    failure: { kind: 'invalid-cursor' },
  })
  const parts: Uint8Array[] = []
  let cursor: string | null = null
  do {
    const page: ContentPage = ok(await ledger.reads.content.read({ ...read, after: cursor }))
    expect(page.attachment).toEqual(source)
    parts.push(page.bytes)
    cursor = page.next
  } while (cursor !== null)
  const expected = Buffer.from(
    'First evidence.\n' + '中间 evidence\n'.repeat(2048) + 'Last evidence.\n',
  )
  expect(Buffer.concat(parts)).toEqual(expected)
  expect(ok(await createToolHistoryMigration(options).apply(command))).toMatchObject({
    ...published,
    kind: 'cleaned',
  })
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT operation FROM tl_chunk WHERE call = 'legacy-offloaded'",
    ),
  ).toEqual([])
  expect(ok(await ledger.reads.content.read(read)).bytes.length).toBe(4093)
  const state = await app.store.read({ kind: 'call', tenant: access.tenant, call: access.call })
  if (state.kind !== 'complete') throw new Error('converted ledger unavailable')
  const converted = state.records.find(row => row.kind === 'result')
  if (converted?.kind !== 'result' || converted.result.value.original.kind !== 'offloaded')
    throw new Error('converted body missing')
  const bodyId = converted.result.value.original.body.description.bodyId
  const semantic = ok(
    await ledger.reads.body.read({ ...access, result, bodyId, after: null, maxBytes: 4093 }),
  )
  if (semantic.kind !== 'text') throw new Error('text body expected')
  expect(Buffer.from(semantic.text)).toEqual(expected.subarray(0, Buffer.byteLength(semantic.text)))
  const host = createLocalHistoricalDeliveryMaintenance({
    store: app.store,
    guarded: createSqlToolGuardedHostCommit(app.options),
    authority: options.authority,
    commitAttempts: 4,
  })
  await expect(host.compact(command)).resolves.toEqual({ ok: { kind: 'compacted', records: 1 } })
  await expect(host.compact(command)).resolves.toEqual({ ok: { kind: 'compacted', records: 0 } })
  materialPorts.clock.sample = async () =>
    succeed(ok(decodeToolMaterialInstant('2026-11-10T00:00:00.000Z')))
  await expect(ledger.reads.content.read(read)).resolves.toMatchObject({
    failure: { kind: 'not-found', target: 'body', reason: 'expired' },
  })
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (ok(await ledger.maintenance.reclaim(access)).kind === 'idle') break
  }
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT material FROM tl_material_chunk WHERE call = 'legacy-offloaded'",
    ),
  ).toEqual([])
  expect(readFileSync(join(app.directory, offloadedFixture.native.key))).toEqual(
    Buffer.from(offloadedFixture.native.base64, 'base64'),
  )
})

it.each(['codec', 'tool', 'duplicate', 'source'])(
  'quarantines an incorrect body interpretation: %s',
  async problem => {
    const { access, migration } = await migrationWorld(offloadedFixture, 'legacy-offloaded')
    const { interpretations } = historicalBodyInput()
    if (problem === 'codec') interpretations[0]!.rawCodec.digest = 'sha256:another'
    if (problem === 'tool') interpretations[0]!.tool.digest = 'sha256:another'
    if (problem === 'source') interpretations[0]!.source.mediaType = 'text/plain'
    if (problem === 'duplicate') interpretations.push(interpretations[0]!)
    await expect(migration.preview({ ...access, interpretations })).resolves.toMatchObject({
      ok: { kind: 'quarantined', reason: 'encoding' },
    })
  },
)

it.each(['utf8', 'digest'])(
  'refuses publication when the body source has invalid %s',
  async problem => {
    const { app, access, options, migration } = await migrationWorld(
      offloadedFixture,
      'legacy-offloaded',
    )
    const { interpretations } = historicalBodyInput()
    const preview = ok(await migration.preview({ ...access, interpretations }))
    if (preview.kind !== 'ready') throw new Error('expected preview')
    const original = options.sourceReader!
    const broken = createToolHistoryMigration({
      ...options,
      sourceReader: {
        read: async input => {
          const answer = await original.read(input)
          if ('failure' in answer) return answer
          const bytes = Uint8Array.from(answer.ok.bytes)
          if (input.after === null) bytes[0] = problem === 'utf8' ? 255 : 71
          return succeed({ ...answer.ok, bytes })
        },
      },
    })
    const command = {
      ...access,
      operation: ok(decodeToolOperationId('invalid-body')),
      source: preview.source,
      interpretations,
    }
    await expect(broken.apply(command)).resolves.toMatchObject({
      failure: { kind: problem === 'utf8' ? 'unavailable' : 'invalid' },
    })
    expect(ok(await migration.inspect(command)).kind).toBe('preparing')
    expect(
      app.sqlite.inspect(
        domainNameOf(TENANT_A),
        "SELECT key FROM tl_record WHERE key LIKE 'historical-body-alias:%'",
      ),
    ).toEqual([])
    expect(
      app.sqlite.inspect(domainNameOf(TENANT_A), 'SELECT material FROM tl_material_chunk'),
    ).toEqual([])
    expect(
      app.sqlite.inspect(
        domainNameOf(TENANT_A),
        "SELECT operation FROM tl_chunk WHERE call = 'legacy-offloaded'",
      ).length,
    ).toBeGreaterThan(0)
  },
)

it('rejects a historical source cursor whose claimed offset differs from its chunk position', async () => {
  const { access, options } = await migrationWorld(offloadedFixture, 'legacy-offloaded')
  const { source } = historicalBodyInput()
  const reader = options.sourceReader!
  const input = {
    ...access,
    attachment: source,
    result: ok(decodeToolResultVersion('v1')),
    after: null,
    maxBytes: 100,
  }
  const first = ok(await reader.read(input))
  if (first.next === null) throw new Error('expected cursor')
  const cursor = JSON.parse(first.next)
  cursor.offset += 1
  await expect(reader.read({ ...input, after: JSON.stringify(cursor) })).resolves.toMatchObject({
    failure: { kind: 'invalid-cursor' },
  })
  const second = ok(await reader.read({ ...input, after: first.next }))
  expect(second.offset).toBe('100')
  expect(second.bytes.length).toBe(100)
})

it('fixes the supplied interpretation before the first asynchronous boundary', async () => {
  const { access, migration } = await migrationWorld(offloadedFixture, 'legacy-offloaded')
  const { interpretations } = historicalBodyInput()
  const preview = ok(await migration.preview({ ...access, interpretations }))
  if (preview.kind !== 'ready') throw new Error('expected preview')
  const command = {
    ...access,
    operation: ok(decodeToolOperationId('fixed-body-input')),
    source: preview.source,
    interpretations,
  }
  const running = migration.apply(command)
  interpretations[0]!.rawCodec.digest = 'sha256:changed-after-call'
  await expect(running).resolves.toMatchObject({ ok: { kind: 'published' } })
})

it('abandons a prepared historical body without touching its old source', async () => {
  const { app, access, options, migration } = await migrationWorld(
    offloadedFixture,
    'legacy-offloaded',
  )
  const command = await previewCommand(migration, access, historicalBodyInput().interpretations)
  const interrupted = createToolHistoryMigration({
    ...options,
    materials: {
      ...options.materials,
      store: {
        ...options.materials.store,
        write: async input => {
          await options.materials.store.write(input)
          return fail({ kind: 'commit-unknown', operation: input.operation })
        },
      },
    },
  })
  await expect(interrupted.apply(command)).resolves.toMatchObject({
    failure: { kind: 'commit-unknown' },
  })
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT material FROM tl_material_chunk WHERE call = 'legacy-offloaded'",
    ).length,
  ).toBeGreaterThan(0)
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (ok(await migration.abandon(command)).kind === 'abandoned') break
  }
  expect(ok(await migration.inspect(command)).kind).toBe('abandoned')
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT material FROM tl_material_chunk WHERE call = 'legacy-offloaded'",
    ),
  ).toEqual([])
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT operation FROM tl_chunk WHERE call = 'legacy-offloaded'",
    ).length,
  ).toBeGreaterThan(0)
  expect(
    app.sqlite.inspect(
      domainNameOf(TENANT_A),
      "SELECT key FROM tl_record WHERE key LIKE 'historical-body-alias:%'",
    ),
  ).toEqual([])
})

it('converges two migration handlers on the same operation and one body', async () => {
  const { app, access, options, migration } = await migrationWorld(
    offloadedFixture,
    'legacy-offloaded',
  )
  const command = await previewCommand(migration, access, historicalBodyInput().interpretations)
  const second = createToolHistoryMigration(options)
  const concurrent = await Promise.all([migration.apply(command), second.apply(command)])
  for (const answer of concurrent) {
    if ('failure' in answer)
      expect(['unavailable', 'stale-revision', 'conflict']).toContain(answer.failure.kind)
  }
  const first = ok(await migration.apply(command))
  const repeated = ok(await second.apply(command))
  expect(first.kind).toBe('cleaned')
  expect(repeated).toEqual(first)
  const state = await app.store.read({ kind: 'call', tenant: access.tenant, call: access.call })
  if (state.kind !== 'complete') throw new Error('missing migrated call')
  expect(state.records.filter(row => row.kind === 'history-migration')).toHaveLength(1)
  expect(state.records.filter(row => row.kind === 'historical-body-alias')).toHaveLength(1)
  expect(
    state.records.filter(row => row.kind === 'material-use' && row.use.kind === 'offloaded-body'),
  ).toHaveLength(1)
})

it('rejects a competing operation while the first migration owns the source', async () => {
  const { app, access, options, migration } = await migrationWorld(
    offloadedFixture,
    'legacy-offloaded',
  )
  const command = await previewCommand(migration, access, historicalBodyInput().interpretations)
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  let paused = false
  const first = createToolHistoryMigration({
    ...options,
    materials: {
      ...options.materials,
      store: {
        ...options.materials.store,
        write: async input => {
          if (!paused) {
            paused = true
            entered.resolve()
            await resume.promise
          }
          return options.materials.store.write(input)
        },
      },
    },
  })
  const running = first.apply(command)
  await entered.promise
  try {
    await expect(
      migration.apply({ ...command, operation: ok(decodeToolOperationId('competing-migration')) }),
    ).resolves.toMatchObject({ failure: { kind: 'conflict' } })
  } finally {
    resume.resolve()
  }
  expect(ok(await running).kind).toBe('published')
  const state = await app.store.read({ kind: 'call', tenant: access.tenant, call: access.call })
  if (state.kind !== 'complete') throw new Error('missing migrated call')
  const journals = state.records.filter(row => row.kind === 'history-migration')
  expect(journals).toHaveLength(1)
  expect(journals[0]).toMatchObject({ migration: { operation: command.operation } })
})

it('recovers a prepared body whose write reply was lost using its original material identity', async () => {
  const { app, access, options, migration } = await migrationWorld(
    offloadedFixture,
    'legacy-offloaded',
  )
  const command = await previewCommand(migration, access, historicalBodyInput().interpretations)
  const interrupted = createToolHistoryMigration({
    ...options,
    materials: {
      ...options.materials,
      store: {
        ...options.materials.store,
        write: async input => {
          const answer = await options.materials.store.write(input)
          if ('failure' in answer) return answer
          return fail({ kind: 'commit-unknown', operation: input.operation })
        },
      },
    },
  })
  await expect(interrupted.apply(command)).resolves.toMatchObject({
    failure: { kind: 'commit-unknown' },
  })
  const before = app.sqlite.inspect(
    domainNameOf(TENANT_A),
    "SELECT material FROM tl_material_chunk WHERE call = 'legacy-offloaded'",
  )
  expect(before.length).toBeGreaterThan(0)
  const restarted = createToolHistoryMigration(options)
  expect(ok(await restarted.apply(command)).kind).toBe('published')
  const state = await app.store.read({ kind: 'call', tenant: access.tenant, call: access.call })
  if (state.kind !== 'complete') throw new Error('missing migrated call')
  const bodies = state.records.filter(
    row => row.kind === 'material' && row.material.purpose === 'body',
  )
  expect(bodies).toHaveLength(1)
  expect(bodies[0]).toMatchObject({
    material: { material: JSON.parse(String(before[0]!.material)) },
  })
})

it('quarantines an unknown responsibility mixed into otherwise current historical records', async () => {
  const { app, access, migration } = await migrationWorld()
  const command = await previewCommand(migration, access)
  expect(ok(await migration.apply(command)).kind).toBe('published')
  expect(ok(await migration.apply(command)).kind).toBe('cleaned')
  await expect(migration.preview({ ...access, interpretations: [] })).resolves.toEqual({
    ok: { kind: 'current' },
  })
  const database = new DatabaseSync(join(app.directory, `${domainNameOf(TENANT_A)}.db`))
  try {
    database
      .prepare('INSERT INTO tl_record (tenant, kind, name, key, record) VALUES (?, ?, ?, ?, ?)')
      .run(
        String(fixture.tables.tl_domain![0]!.tenant),
        'call',
        access.call,
        'future-responsibility:1',
        JSON.stringify({ kind: 'future-responsibility-v2', pending: true }),
      )
  } finally {
    database.close()
  }
  await expect(migration.preview({ ...access, interpretations: [] })).resolves.toEqual({
    ok: { kind: 'quarantined', reason: 'unsupported-format' },
  })
})

it.each(['inspect', 'abandon'] as const)(
  'fixes the %s address before awaiting authorization',
  async method => {
    const { access, options, migration } = await migrationWorld()
    const command = await previewCommand(migration, access)
    const published = ok(await migration.apply(command))
    const gate = Promise.withResolvers<void>()
    const reads: unknown[] = []
    const checked: unknown[] = []
    const delayed = createToolHistoryMigration({
      ...options,
      authority: {
        qualify: async input => {
          checked.push({ tenant: input.tenant, call: input.call })
          await gate.promise
          return succeed(undefined)
        },
      },
      store: {
        ...options.store,
        read: async domain => {
          reads.push(domain)
          return options.store.read(domain)
        },
      },
    })
    const request = { ...access, operation: command.operation }
    const pending = delayed[method](request)
    request.tenant = TENANT_B
    request.call = ok(decodeToolCallId('foreign-call'))
    request.operation = ok(decodeToolOperationId('foreign-operation'))
    gate.resolve()
    const answer = await pending
    if (method === 'inspect') expect(answer).toEqual({ ok: published })
    else
      expect(answer).toMatchObject({ failure: { kind: 'conflict', operation: command.operation } })
    expect(reads).toEqual([{ kind: 'call', tenant: access.tenant, call: access.call }])
    expect(checked.length).toBeGreaterThan(0)
    expect(
      checked.every(
        value =>
          JSON.stringify(value) === JSON.stringify({ tenant: access.tenant, call: access.call }),
      ),
    ).toBe(true)
  },
)
