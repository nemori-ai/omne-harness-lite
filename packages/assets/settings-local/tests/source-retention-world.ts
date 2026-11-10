import { sourceReadinessMaterials } from '../src/source-readiness-materials.ts'
import { SOURCE_READINESS_FACT, SOURCE_READINESS_PARTICIPANT } from '../src/source-readiness.ts'
import type { SettingsAttemptBinding } from '../src/attempt-binding.ts'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  SOURCE_RETENTION_MIGRATION,
  SOURCE_RETENTION_OWNER,
  SOURCE_RETENTION_PROTOCOL,
  SOURCE_RETENTION_TABLES,
  type SourceRequest,
  type SourceSnapshot,
  type SourceUpdate,
  type SourceSettlement,
  type SourcePage,
  type SourceReference,
} from '../src/source-retention-schema.ts'
import { json } from '../src/encoding.ts'
import { config } from './config.ts'
import { allocation } from './intent-world.ts'
import { definition, definitionRef } from './world.ts'

export const source: SourceReference = {
  domain: { scope: { kind: 'system' }, transactionDomain: 'system.settings' },
  target: { policyId: 'independent', scopeRef: 'organization-a', targetRef: 'permission-bounds' },
}
export function sourceRequest(attemptId = 'destination-attempt'): SourceRequest {
  return {
    source,
    destination: {
      ownerRef: 'settings',
      identity: allocation().identity,
      attemptId,
      route: 'settings.destination',
      commandDigest: 'a'.repeat(64),
    },
  }
}
export function sourceUpdate(operationId = 'source-update-1'): SourceUpdate {
  return {
    source,
    identity: {
      domain: source.domain,
      principalRef: 'admin',
      operation: { target: source.target, operationId },
    },
    commandDigest: 'b'.repeat(64),
  }
}
export function sourceSnapshot(): SourceSnapshot {
  return {
    source,
    presence: 'absent',
    state: { revision: 0, sources: [{ id: 'organization', values: [] }] },
    projection: {
      target: source.target,
      definition,
      definitionRef,
      enabled: true,
      ownerRevision: 1,
      sources: [
        {
          sourceId: 'organization',
          ownerRef: 'settings',
          scope: { kind: 'organization', subjectRef: 'organization-a' },
          authorityRevision: '1',
        },
      ],
      grants: [],
    },
  }
}
type Command =
  | { kind: 'reserve'; request: SourceRequest; snapshot: SourceSnapshot }
  | { kind: 'settle'; input: SourceSettlement }
  | { kind: 'begin'; update: SourceUpdate }
  | { kind: 'finish'; update: SourceUpdate; outcome: 'committed' | 'aborted' }
type Read =
  | { kind: 'gate'; source: SourceReference }
  | { kind: 'reservation'; request: SourceRequest }
  | { kind: 'readiness'; update: SourceUpdate }
  | { kind: 'holds' | 'updates'; page: SourcePage }
function moduleFile(relative: string) {
  const url = new URL(relative, import.meta.url)
  return {
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export async function openSourceWorld(existingRoot?: string) {
  const parent = fileURLToPath(
    new URL('../../../../tmp/closures/settings-source-retention/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const root = existingRoot ?? realpathSync(mkdtempSync(join(parent, 'case-')))
  const migration = moduleFile('../dist/source-retention-migration.js')
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: [
      ...sourceReadinessMaterials().participants,
      {
        participant: 'fixture.source-readiness-sink',
        protocol: 'fixture-source-readiness/1',
        ...moduleFile('./source-readiness-sink.mjs'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [SOURCE_READINESS_FACT],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: SOURCE_RETENTION_OWNER,
        protocol: SOURCE_RETENTION_PROTOCOL,
        ...moduleFile('./source-retention-writer.mjs'),
        ownedTables: SOURCE_RETENTION_TABLES,
        readTables: [],
        requiresFacts: [],
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
    readHandlers: [
      {
        handler: 'fixture.source-retention.read',
        protocol: 'fixture-source-retention/1',
        ...moduleFile('./source-retention-reader.mjs'),
        ordering: 'snapshot',
        readTables: SOURCE_RETENTION_TABLES,
        requiresMigrations: [SOURCE_RETENTION_MIGRATION],
        maxRowsRead: 100,
        maxOutputBytes: 8 * 1024 * 1024,
      },
    ],
    declaredCombinations: { tenant: null, system: null },
  }
  const participants = materials.participants.map(p => p.participant)
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combination = {
    ...source.domain,
    combinationVersion: 'source-test/1',
    manifestDigest: manifestDigest(manifest.manifest),
    participants,
  }
  const made = await createSqliteStorage({
    config: config(root),
    materials,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  const registered = await made.storage.registerCombination(combination)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  return {
    root,
    readiness(binding: SettingsAttemptBinding, expected = binding) {
      return made.storage.commit({
        identity: {
          ...source.domain,
          operation: 'fixture.source-readiness',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        combinationVersion: combination.combinationVersion,
        manifestDigest: combination.manifestDigest,
        commands: [
          { participant: 'fixture.source-readiness-sink', facts: { binding: json(expected) } },
          {
            participant: SOURCE_READINESS_PARTICIPANT,
            facts: { binding: json(binding), gate: { pending: null, held: 0 } },
          },
        ],
      })
    },
    write(commands: Command[], rollback = false) {
      return made.storage.commit({
        identity: {
          ...source.domain,
          operation: 'fixture.source-retention',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        combinationVersion: combination.combinationVersion,
        manifestDigest: combination.manifestDigest,
        commands: [
          { participant: SOURCE_RETENTION_OWNER, facts: { commands: json(commands), rollback } },
        ],
      })
    },
    read(input: Read) {
      return made.storage.read({
        domain: source.domain,
        handler: 'fixture.source-retention.read',
        protocol: 'fixture-source-retention/1',
        requestKey: randomUUID(),
        input: json(input),
      })
    },
    async close() {
      const result = await made.control.close({ initiator: 'disposal' })
      if (result.kind !== 'closed') throw new Error(JSON.stringify(result))
    },
  }
}
