import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import {
  REQUEST_HANDLER,
  REQUEST_MIGRATION,
  REQUEST_PLANNER,
  REQUEST_PROTOCOL,
  REQUEST_WRITER,
  LOCAL_PROTOCOL,
  PLAN_FACT,
  WAIT_BASIS_FACT,
  WAIT_ACCEPTED_FACT,
} from './request-schema.ts'
import { POOL_HANDLER } from './pool-schema.ts'
import {
  TERMINAL_FACT,
  TERMINAL_HANDLER,
  TERMINAL_MIGRATION,
  TERMINAL_PARTICIPANT,
  TERMINAL_PROTOCOL,
} from './terminal-schema.ts'
import { requestTables, terminalTables } from './relational-ddl.ts'
import {
  REQUEST_RELATIONAL_MIGRATION,
  TERMINAL_RELATIONAL_MIGRATION,
} from './relational-migrations.ts'
import { WAIT_STATE_MIGRATION } from './wait-schema.ts'
export function material(name: string) {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js',
    url = new URL(`./${name}.${extension}`, import.meta.url)
  return {
    moduleUrl: url.href,
    digest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export function hitlSqlMaterials(): Pick<
  SqlMaterialCatalog,
  'participants' | 'migrations' | 'readHandlers'
> {
  const participant = material('terminal-participant'),
    planner = material('joint-plan'),
    writer = material('request-write')
  const migration = material('terminal-migration'),
    terminalUpgrade = material('terminal-relational-migration')
  const requestMigration = material('request-migration'),
    requestUpgrade = material('request-relational-migration')
  const reader = material('terminal-read'),
    requestReader = material('request-read'),
    poolReader = material('pool-read')
  return {
    participants: [
      {
        participant: REQUEST_PLANNER,
        protocol: LOCAL_PROTOCOL,
        moduleUrl: planner.moduleUrl,
        codeDigest: planner.digest,
        ownedTables: [],
        readTables: [
          'hi_requests_v2',
          'hi_request_states_v2',
          'hi_questions_v2',
          'hi_card_states_v2',
          'hi_decisions_v2',
        ],
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
        ownedTables: [...requestTables, 'hi_requests', 'hi_request_versions'],
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
        ownedTables: [...terminalTables, 'hi_terminals'],
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
      {
        ...REQUEST_RELATIONAL_MIGRATION,
        moduleUrl: requestUpgrade.moduleUrl,
        checksum: requestUpgrade.digest,
        requires: [REQUEST_MIGRATION, WAIT_STATE_MIGRATION],
      },
      {
        ...TERMINAL_RELATIONAL_MIGRATION,
        moduleUrl: terminalUpgrade.moduleUrl,
        checksum: terminalUpgrade.digest,
        requires: [TERMINAL_MIGRATION],
      },
    ],
    readHandlers: [
      {
        handler: POOL_HANDLER,
        protocol: REQUEST_PROTOCOL,
        moduleUrl: poolReader.moduleUrl,
        codeDigest: poolReader.digest,
        ordering: 'snapshot',
        readTables: [...requestTables, 'hi_request_versions'],
        requiresMigrations: [REQUEST_RELATIONAL_MIGRATION],
        maxRowsRead: 1117,
        maxOutputBytes: 8388608,
      },
      {
        handler: REQUEST_HANDLER,
        protocol: REQUEST_PROTOCOL,
        moduleUrl: requestReader.moduleUrl,
        codeDigest: requestReader.digest,
        ordering: 'snapshot',
        readTables: [...requestTables],
        requiresMigrations: [REQUEST_RELATIONAL_MIGRATION],
        maxRowsRead: 65,
        maxOutputBytes: 8388608,
      },
      {
        handler: TERMINAL_HANDLER,
        protocol: TERMINAL_PROTOCOL,
        moduleUrl: reader.moduleUrl,
        codeDigest: reader.digest,
        ordering: 'snapshot',
        readTables: [...terminalTables],
        requiresMigrations: [TERMINAL_RELATIONAL_MIGRATION],
        maxRowsRead: 1,
        maxOutputBytes: 32768,
      },
    ],
  }
}
