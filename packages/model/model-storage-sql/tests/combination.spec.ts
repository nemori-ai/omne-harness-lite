// M4-6, an early guard only: the materials of this member and `sessionStorageMaterials()` form a
// valid combination for one tenant domain, and a construction that checks materials verifies the
// code digests of both. The combination guarantee itself belongs to the session storage combination
// row of the application (L-APP). This member has no `modelStorageMaterials()` yet, so the
// descriptors are built here from the built module files, the way that function will build them.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CALL_HANDLER,
  CALL_READ_MAX_OUTPUT_BYTES,
  CALL_READ_MAX_ROWS,
  COMMAND_RESERVE_BYTES,
  MIGRATION,
  MODEL_PARTICIPANT,
  MODEL_TABLES,
  PENDING_HANDLER,
  PENDING_PAGE_MAX,
  PROTOCOL,
  TABLES,
  createSqlModelCommands,
} from '@omne-harness/model-storage-sql'
import { sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createMemorySqlStorage } from '@omne-harness/sql-contract/testing'
import { coreOptions, lookup, sqliteStorage, tenantOf, textOf } from './fixture.ts'

function file(name: string): Readonly<{ moduleUrl: string; digest: string }> {
  const moduleUrl = new URL(`../dist/${name}.js`, import.meta.url).href
  const digest = createHash('sha256')
    .update(readFileSync(fileURLToPath(moduleUrl)))
    .digest('hex')
  return { moduleUrl, digest }
}

function modelMaterials() {
  const participant = file('commit')
  const migration = file('schema')
  const reads = file('reads')
  const requiresMigrations = [{ owner: MIGRATION.owner, id: MIGRATION.id }]
  return {
    participants: [
      {
        participant: MODEL_PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: MODEL_TABLES,
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable' as const,
      },
    ],
    migrations: [
      {
        ...requiresMigrations[0]!,
        moduleUrl: migration.moduleUrl,
        checksum: migration.digest,
        requires: [],
      },
    ],
    readHandlers: [
      {
        handler: CALL_HANDLER,
        readTables: MODEL_TABLES,
        maxOutputBytes: CALL_READ_MAX_OUTPUT_BYTES,
        maxRowsRead: CALL_READ_MAX_ROWS,
      },
      {
        handler: PENDING_HANDLER,
        readTables: [TABLES.call.name],
        maxOutputBytes: 1 << 20,
        maxRowsRead: PENDING_PAGE_MAX + 1,
      },
    ].map(item => ({
      ...item,
      protocol: PROTOCOL,
      moduleUrl: reads.moduleUrl,
      codeDigest: reads.digest,
      ordering: 'snapshot' as const,
      requiresMigrations,
    })),
  }
}

function catalogOf(model: ReturnType<typeof modelMaterials>): SqlMaterialCatalog {
  const session = sessionStorageMaterials()
  return {
    catalogProtocol: 'sql-catalog/1',
    participants: [...session.participants, ...model.participants],
    migrations: [...session.migrations, ...model.migrations],
    readHandlers: [...session.readHandlers, ...model.readHandlers],
    declaredCombinations: {
      tenant: { combinationVersion: 'session-model-1', participants: ['session', 'model'] },
      system: null,
    },
  }
}

describe('the combination with the session log', () => {
  it('forms a valid manifest, and the SQL commands take its digest', () => {
    const catalog = catalogOf(modelMaterials())
    const manifest = combinationManifest({ catalog, participants: ['session', MODEL_PARTICIPANT] })
    if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
    expect(manifest.manifest.participants.map(item => item.participant)).toEqual([
      MODEL_PARTICIPANT,
      'session',
    ])
    const A = tenantOf('a')
    expect(() =>
      createSqlModelCommands({
        ...coreOptions([A]).options,
        storage: sqliteStorage().storage,
        domains: lookup([textOf(A)], 'shared'),
        combination: {
          combinationVersion: 'session-model-1',
          manifestDigest: manifestDigest(manifest.manifest),
        },
        maxCallBytes: 1 << 20,
        maxCommandBytes: (1 << 20) + COMMAND_RESERVE_BYTES,
      }),
    ).not.toThrow()
  })

  it('passes the construction that checks the code digests of both members', async () => {
    const built = await createMemorySqlStorage({ materials: catalogOf(modelMaterials()) })
    expect(await built.control.close({ initiator: 'disposal' })).toEqual({ kind: 'closed' })
  })

  it('fails the construction when the code digest of the model participant does not match', async () => {
    const model = modelMaterials()
    const [participant] = model.participants
    if (participant === undefined) throw new Error('no participant')
    const tampered = { ...model, participants: [{ ...participant, codeDigest: 'f'.repeat(64) }] }
    await expect(createMemorySqlStorage({ materials: catalogOf(tampered) })).rejects.toThrow(
      'material_digest_mismatch: participant model',
    )
  })
})
