import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  combinationManifest,
  manifestDigest,
  type CommitResultV2,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import {
  createStandaloneSettingsOwner,
  settingsStandaloneMaterials,
  settingsSqlMaterials,
  standaloneSettingsGuards,
} from '../src/index.ts'
import { SOURCE_SNAPSHOT_FACT, SOURCE_SNAPSHOT_PARTICIPANT } from '../src/source-snapshot.ts'
import { SOURCE_RETENTION_OWNER } from '../src/source-retention-schema.ts'
import { sourceKey } from '../src/source-retention-records.ts'
import { sourceUpdate } from './source-retention-world.ts'
import { canonical, digest, json } from '../src/encoding.ts'
import { command, context, definition, openWorld } from './world.ts'
import { sourceRequest } from './source-retention-world.ts'
import { ownerSources } from './sources.ts'
const worlds: Awaited<ReturnType<typeof openWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
function file(relative: string) {
  const url = new URL(relative, import.meta.url)
  return {
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
async function open(root?: string) {
  const extras: Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'> = {
    participants: [
      {
        participant: 'fixture.source-snapshot-sink',
        protocol: 'fixture-source-snapshot/1',
        ...file('./source-snapshot-sink.mjs'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [SOURCE_SNAPSHOT_FACT],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [],
    readHandlers: [],
  }
  const w = await openWorld({
    sourceCapture: true,
    ...(root ? { root } : {}),
    authority: { materials: settingsStandaloneMaterials(), guards: standaloneSettingsGuards },
    extraMaterials: extras,
  })
  worlds.push(w)
  const owner = createStandaloneSettingsOwner({
    storage: w.storage,
    domain: w.domain,
    combinationVersion: w.combination.combinationVersion,
    manifestDigest: w.combination.manifestDigest,
  })
  const target = command().target
  const record = {
    publicationRef: null,
    target,
    definition,
    sources: ownerSources('tenant'),
    grants: [
      {
        sourceId: 'tenant',
        actions: ['set', 'clear', 'lock', 'unlock'] as ('set' | 'clear' | 'lock' | 'unlock')[],
      },
    ],
  }
  const persistence = settingsSqlMaterials({ sourceCapture: true })
  const targets = settingsStandaloneMaterials()
  const catalog: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: [...persistence.participants, ...targets.participants, ...extras.participants],
    migrations: [...persistence.migrations, ...targets.migrations, ...extras.migrations],
    readHandlers: [...persistence.readHandlers, ...targets.readHandlers, ...extras.readHandlers],
    declaredCombinations: { tenant: null, system: null },
  }
  const participants = catalog.participants.map(participant => participant.participant)
  const manifest = combinationManifest({ catalog, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combo = {
    ...w.domain,
    combinationVersion: 'source-capture/1',
    manifestDigest: manifestDigest(manifest.manifest),
    participants,
  }
  const registered = await w.storage.registerCombination(combo)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const request = sourceRequest()
  request.source = { domain: w.domain, target }
  return {
    ...w,
    owner,
    record,
    request,
    async provision() {
      return owner.mutate({
        kind: 'provision',
        operationId: 'provision',
        expectedRevision: null,
        record,
      })
    },
    capture(hold = false, sinkRequest = request) {
      return w.storage.commit({
        identity: {
          ...w.domain,
          operation: 'fixture.source-capture',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        combinationVersion: combo.combinationVersion,
        manifestDigest: combo.manifestDigest,
        commands: [
          {
            participant: hold ? SOURCE_RETENTION_OWNER : 'fixture.source-snapshot-sink',
            facts: { kind: 'reserve', request: json(sinkRequest) },
          },
          {
            participant: SOURCE_SNAPSHOT_PARTICIPANT,
            facts: { request: json(request), forgedSnapshot: { value: 'ignored-client-value' } },
          },
        ],
      })
    },
  }
}
function response(result: CommitResultV2) {
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  return result.responses.find(reply =>
    [SOURCE_RETENTION_OWNER, 'fixture.source-snapshot-sink'].includes(reply.participant),
  )?.reply.response
}
it('reads the real owner and assignment state in transaction order, including absence and locks', async () => {
  const w = await open()
  expect(response(await w.capture())).toEqual({ kind: 'unavailable', reason: 'forbidden' })
  expect(await w.provision()).toMatchObject({ kind: 'committed' })
  expect(response(await w.capture())).toMatchObject({
    kind: 'captured',
    snapshot: {
      presence: 'absent',
      state: { revision: 0, sources: [{ id: 'tenant', values: [] }] },
      projection: { ownerRevision: 1 },
    },
  })
  expect(await w.backend.commit(context, command())).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  expect(
    await w.backend.commit(
      context,
      command({ operationId: 'lock', expectedRevision: 1, action: { kind: 'lock' } }),
    ),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(response(await w.capture())).toMatchObject({
    kind: 'captured',
    snapshot: {
      presence: 'present',
      state: {
        revision: 2,
        sources: [
          {
            id: 'tenant',
            values: [{ itemId: 'enabled', value: { kind: 'value', value: true }, locked: true }],
          },
        ],
      },
    },
  })
})
it('persists a snapshot supplied by the real producer and recognizes it after reopening', async () => {
  const w = await open()
  await w.provision()
  await w.backend.commit(context, command())
  const held = response(await w.capture(true))
  expect(held).toMatchObject({
    kind: 'held',
    snapshot: { presence: 'present', state: { revision: 1 } },
  })
  await w.close()
  const reopened = await open(w.root)
  expect(response(await reopened.capture(true))).toEqual(held)
})
it('refuses a retired target or mismatched definition instead of fabricating an absent source', async () => {
  const w = await open()
  await w.provision()
  await w.backend.commit(context, command())
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'definition-v2',
      expectedRevision: 1,
      record: { ...w.record, definition: { ...definition, version: '2' } },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(response(await w.capture())).toEqual({ kind: 'unavailable', reason: 'definition_changed' })
  expect(
    await w.owner.mutate({
      kind: 'retire',
      operationId: 'retire',
      expectedRevision: 2,
      target: w.record.target,
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(response(await w.capture())).toEqual({ kind: 'unavailable', reason: 'forbidden' })
})
it('binds the produced fact to the complete destination request', async () => {
  const w = await open()
  await w.provision()
  const other = {
    ...w.request,
    destination: { ...w.request.destination, attemptId: 'other-attempt' },
  }
  expect((await w.capture(true, other)).kind).toBe('rolled_back')
  expect(response(await w.capture(true))).toMatchObject({ kind: 'held', request: w.request })
})
it('blocks direct writers after reopening a pending gate even when no reservations remain', async () => {
  const w = await open()
  await w.provision()
  await w.close()
  const update = sourceUpdate()
  update.source = w.request.source
  update.identity = {
    domain: w.domain,
    principalRef: 'admin',
    operation: { target: w.record.target, operationId: 'pending-update' },
  }
  const database = new DatabaseSync(
    join(w.root, 'domains', `${Buffer.from(w.domain.transactionDomain).toString('hex')}.sqlite`),
  )
  try {
    database
      .prepare(
        'INSERT INTO st_source_gate (source_key, source_json, pending_key, pending_json) VALUES (?, ?, ?, ?)',
      )
      .run(
        sourceKey(update.source),
        canonical(update.source),
        digest(update.identity),
        canonical(update),
      )
    expect(
      database.prepare('SELECT count(*) AS count FROM st_source_reservation').get()?.['count'],
    ).toBe(0)
  } finally {
    database.close()
  }
  const reopened = await open(w.root)
  expect(await reopened.backend.commit(context, command())).toEqual({
    kind: 'rejected',
    reason: 'basis_changed',
  })
  expect(
    await reopened.owner.mutate({
      kind: 'retire',
      operationId: 'retire-pending',
      expectedRevision: 1,
      target: w.record.target,
    }),
  ).toEqual({ kind: 'rejected', reason: 'basis_changed' })
  expect(response(await reopened.capture())).toMatchObject({
    kind: 'captured',
    snapshot: { presence: 'absent', projection: { ownerRevision: 1 } },
  })
  expect(response(await reopened.capture(true))).toEqual({ kind: 'blocked' })
})
