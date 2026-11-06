import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { governanceSqlMigrations } from '@omne-harness/governance-local'
import { GOVERNANCE_TABLES } from '../src/migration.ts'
import { config } from './config.ts'

it('installs the production migration through the real Worker and reopens the same domain', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'governance-worker-')))
  const url = new URL('./schema-writer.mjs', import.meta.url)
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: [
      {
        participant: 'governance.activation',
        protocol: 'fixture-governance-schema/1',
        moduleUrl: url.href,
        codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
        ownedTables: GOVERNANCE_TABLES,
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: governanceSqlMigrations(),
    readHandlers: [],
    declaredCombinations: { tenant: null, system: null },
  }
  const participants = ['governance.activation']
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const domain = {
    scope: { kind: 'tenant' as const, tenant: 'tenant-a' },
    transactionDomain: 'governance-schema',
  }
  const combination = {
    ...domain,
    combinationVersion: 'fixture/1',
    manifestDigest: manifestDigest(manifest.manifest),
    participants,
  }
  try {
    for (const existing of [false, true]) {
      const made = await createSqliteStorage({
        config: config(root),
        materials,
        closeLeases: { admit: () => ({}), release() {} },
      })
      if (made.kind !== 'created') throw new Error(JSON.stringify(made))
      try {
        expect(await made.storage.registerCombination(combination)).toMatchObject({
          kind: 'registered',
        })
        const result = await made.storage.commit({
          identity: {
            ...domain,
            operation: 'fixture.schema',
            protocolVersion: '2',
            operationKey: randomUUID(),
          },
          combinationVersion: combination.combinationVersion,
          manifestDigest: combination.manifestDigest,
          commands: [{ participant: 'governance.activation', facts: {} }],
        })
        expect(result).toMatchObject({
          kind: 'committed',
          responses: [{ reply: { response: { existing, pending: 0 } } }],
        })
      } finally {
        expect(await made.control.close({ initiator: 'disposal' })).toMatchObject({
          kind: 'closed',
        })
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
