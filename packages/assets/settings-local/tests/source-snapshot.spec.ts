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
import { sourceSnapshotMaterials } from '../src/source-snapshot-materials.ts'
import { SOURCE_SNAPSHOT_FACT, SOURCE_SNAPSHOT_PARTICIPANT } from '../src/source-snapshot.ts'
import {
  SOURCE_RETENTION_MIGRATION,
  SOURCE_RETENTION_OWNER,
  SOURCE_RETENTION_PROTOCOL,
  SOURCE_RETENTION_TABLES,
} from '../src/source-retention-schema.ts'
import { json } from '../src/encoding.ts'
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
  const snapshot = sourceSnapshotMaterials()
  const migration = file('../dist/source-retention-migration.js')
  const extras: Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'> = {
    participants: [
      ...snapshot.participants,
      {
        participant: SOURCE_RETENTION_OWNER,
        protocol: SOURCE_RETENTION_PROTOCOL,
        ...file('./source-snapshot-sink.mjs'),
        ownedTables: SOURCE_RETENTION_TABLES,
        readTables: [],
        requiresFacts: [SOURCE_SNAPSHOT_FACT],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      {
        ...SOURCE_RETENTION_MIGRATION,
        moduleUrl: migration.moduleUrl,
        checksum: migration.codeDigest,
        requires: [],
      },
    ],
    readHandlers: [],
  }
  const w = await openWorld({
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
  const persistence = settingsSqlMaterials()
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
          { participant: SOURCE_RETENTION_OWNER, facts: { request: json(sinkRequest), hold } },
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
  return result.responses.find(reply => reply.participant === SOURCE_RETENTION_OWNER)?.reply
    .response
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
