import {
  REQUEST_HANDLER,
  REQUEST_MIGRATION,
  REQUEST_PLANNER,
  REQUEST_PROTOCOL,
  REQUEST_WRITER,
  PLAN_FACT,
  WAIT_BASIS_FACT,
  WAIT_ACCEPTED_FACT,
} from './request-schema.ts'
import { POOL_HANDLER } from './pool-schema.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import {
  TERMINAL_FACT,
  TERMINAL_HANDLER,
  TERMINAL_MIGRATION,
  TERMINAL_PARTICIPANT,
  TERMINAL_PROTOCOL,
  TERMINAL_TABLE,
} from './terminal-schema.ts'

export function material(name: string) {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const url = new URL(`./${name}.${extension}`, import.meta.url)
  return {
    moduleUrl: url.href,
    digest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export function hitlSqlMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const participant = material('terminal-participant')
  const migration = material('terminal-migration')
  const reader = material('terminal-read')
  const planner = material('request-plan')
  const writer = material('request-write')
  const requestMigration = material('request-migration')
  const requestReader = material('request-read')
  const poolReader = material('pool-read')
  return {
    participants: [
      {
        participant: REQUEST_PLANNER,
        protocol: REQUEST_PROTOCOL,
        moduleUrl: planner.moduleUrl,
        codeDigest: planner.digest,
        ownedTables: [],
        readTables: ['hi_requests'],
        requiresFacts: [TERMINAL_FACT, WAIT_BASIS_FACT],
        providesFacts: [PLAN_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: REQUEST_WRITER,
        protocol: REQUEST_PROTOCOL,
        moduleUrl: writer.moduleUrl,
        codeDigest: writer.digest,
        ownedTables: ['hi_requests', 'hi_request_versions'],
        readTables: [],
        requiresFacts: [PLAN_FACT, WAIT_ACCEPTED_FACT],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: TERMINAL_PARTICIPANT,
        protocol: TERMINAL_PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: [TERMINAL_TABLE],
        readTables: [],
        requiresFacts: [],
        providesFacts: [TERMINAL_FACT],
        allowedFunctions: [],
        grouping: 'groupable',
      },
    ],
    migrations: [
      {
        ...REQUEST_MIGRATION,
        moduleUrl: requestMigration.moduleUrl,
        checksum: requestMigration.digest,
        requires: [],
      },
      {
        ...TERMINAL_MIGRATION,
        moduleUrl: migration.moduleUrl,
        checksum: migration.digest,
        requires: [],
      },
    ],
    readHandlers: [
      {
        handler: POOL_HANDLER,
        protocol: REQUEST_PROTOCOL,
        moduleUrl: poolReader.moduleUrl,
        codeDigest: poolReader.digest,
        ordering: 'snapshot',
        readTables: ['hi_requests', 'hi_request_versions'],
        requiresMigrations: [REQUEST_MIGRATION],
        maxRowsRead: 2,
        maxOutputBytes: 1048576,
      },
      {
        handler: REQUEST_HANDLER,
        protocol: REQUEST_PROTOCOL,
        moduleUrl: requestReader.moduleUrl,
        codeDigest: requestReader.digest,
        ordering: 'snapshot',
        readTables: ['hi_requests'],
        requiresMigrations: [REQUEST_MIGRATION],
        maxRowsRead: 1,
        maxOutputBytes: 1048576,
      },
      {
        handler: TERMINAL_HANDLER,
        protocol: TERMINAL_PROTOCOL,
        moduleUrl: reader.moduleUrl,
        codeDigest: reader.digest,
        ordering: 'snapshot',
        readTables: [TERMINAL_TABLE],
        requiresMigrations: [TERMINAL_MIGRATION],
        maxRowsRead: 1,
        maxOutputBytes: 32768,
      },
    ],
  }
}
