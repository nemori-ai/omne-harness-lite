import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type CombinationRegistrationV2,
} from '@omne-harness/sql-contract'

export const COMPACTION_SQL_DOMAIN = {
  scope: { kind: 'system' },
  transactionDomain: 'context.compaction',
} as const
const participant = 'context.compaction.tasks'
const migration = { owner: participant, id: '001-tasks' }

function module(file: string) {
  const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js'
  const url = new URL(`./worker/${file}${extension}`, import.meta.url)
  return {
    moduleUrl: url.href,
    digest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}

export function compactionSqlCatalog(): SqlMaterialCatalog {
  const write = module('tasks')
  const up = module('migration')
  const read = module('read-tasks')
  return {
    catalogProtocol: 'sql-catalog/1',
    participants: [
      {
        participant,
        protocol: '1',
        moduleUrl: write.moduleUrl,
        codeDigest: write.digest,
        ownedTables: ['cc_task', 'cc_content'],
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [{ ...migration, moduleUrl: up.moduleUrl, checksum: up.digest, requires: [] }],
    readHandlers: [
      {
        handler: 'context.compaction.tasks.read',
        protocol: '1',
        moduleUrl: read.moduleUrl,
        codeDigest: read.digest,
        ordering: 'domain-serial',
        readTables: ['cc_task', 'cc_content'],
        requiresMigrations: [migration],
        maxOutputBytes: 4 * 1024 * 1024,
        maxRowsRead: 101,
      },
    ],
    declaredCombinations: { tenant: null, system: null },
  }
}

export function compactionSqlRegistration(): CombinationRegistrationV2 {
  const catalog = compactionSqlCatalog()
  const manifest = combinationManifest({ catalog, participants: [participant] })
  if (manifest.kind !== 'manifest') throw new Error(`invalid compaction catalog: ${manifest.kind}`)
  const digest = manifestDigest(manifest.manifest)
  return {
    ...COMPACTION_SQL_DOMAIN,
    participants: [participant],
    combinationVersion: `compaction/${digest}`,
    manifestDigest: digest,
  }
}
