import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
} from '@omne-harness/sql-contract'
import {
  DIAGNOSTICS_HANDLER,
  DIAGNOSTICS_READ_MAX_OUTPUT_BYTES,
  DIAGNOSTICS_READ_MAX_ROWS,
} from './diagnostics.ts'
import {
  CALL_HANDLER,
  CALL_READ_MAX_OUTPUT_BYTES,
  CALL_READ_MAX_ROWS,
  PENDING_HANDLER,
  PENDING_READ_MAX_ROWS,
  REQUEST_HANDLER,
  REQUEST_READ_MAX_OUTPUT_BYTES,
  REQUEST_READ_MAX_ROWS,
} from './reads.ts'
import {
  DISPATCH_FACTS_HANDLER,
  DISPATCH_FACTS_READ_MAX_OUTPUT_BYTES,
  DISPATCH_FACTS_READ_MAX_ROWS,
} from './dispatch-facts.ts'
import { DISPATCH_FACT, FACT_MIGRATION } from './fact-schema.ts'
import { MIGRATION, MODEL_PARTICIPANT, MODEL_TABLES, PROTOCOL, TABLES } from './schema.ts'

export const PENDING_READ_MAX_OUTPUT_BYTES = 1 << 20

const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js'

function module(name: string): Readonly<{ moduleUrl: string; digest: string }> {
  const moduleUrl = new URL(`./${name}${extension}`, import.meta.url).href
  const digest = createHash('sha256')
    .update(readFileSync(fileURLToPath(moduleUrl)))
    .digest('hex')
  return { moduleUrl, digest }
}

const migrationRef = Object.freeze({ owner: MIGRATION.owner, id: MIGRATION.id })
const factMigrationRef = Object.freeze({ owner: FACT_MIGRATION.owner, id: FACT_MIGRATION.id })

type Handler = Readonly<{
  handler: string
  file: string
  tables: readonly string[]
  rows: number
  bytes: number
  migrations?: readonly Readonly<{ owner: string; id: string }>[]
}>

const HANDLERS: readonly Handler[] = [
  {
    handler: CALL_HANDLER,
    file: 'handler-call',
    tables: MODEL_TABLES,
    rows: CALL_READ_MAX_ROWS,
    bytes: CALL_READ_MAX_OUTPUT_BYTES,
  },
  {
    handler: REQUEST_HANDLER,
    file: 'handler-request',
    tables: [TABLES.call.name, TABLES.request.name],
    rows: REQUEST_READ_MAX_ROWS,
    bytes: REQUEST_READ_MAX_OUTPUT_BYTES,
  },
  {
    handler: PENDING_HANDLER,
    file: 'handler-pending',
    tables: [TABLES.call.name],
    rows: PENDING_READ_MAX_ROWS,
    bytes: PENDING_READ_MAX_OUTPUT_BYTES,
  },
  {
    handler: DIAGNOSTICS_HANDLER,
    file: 'handler-diagnostics',
    tables: [TABLES.call.name, TABLES.dispatch.name],
    rows: DIAGNOSTICS_READ_MAX_ROWS,
    bytes: DIAGNOSTICS_READ_MAX_OUTPUT_BYTES,
  },
  {
    handler: DISPATCH_FACTS_HANDLER,
    file: 'handler-dispatch-facts',
    tables: [DISPATCH_FACT.name],
    rows: DISPATCH_FACTS_READ_MAX_ROWS,
    bytes: DISPATCH_FACTS_READ_MAX_OUTPUT_BYTES,
    migrations: [migrationRef, factMigrationRef],
  },
]

export type ModelStorageMaterials = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
}>

export function modelStorageMaterials(): ModelStorageMaterials {
  const participant = module('commit')
  const migration = module('schema')
  const factMigration = module('fact-schema')
  return {
    participants: [
      {
        participant: MODEL_PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: [...MODEL_TABLES, DISPATCH_FACT.name],
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      { ...migrationRef, moduleUrl: migration.moduleUrl, checksum: migration.digest, requires: [] },
      {
        ...factMigrationRef,
        moduleUrl: factMigration.moduleUrl,
        checksum: factMigration.digest,
        requires: [migrationRef],
      },
    ],
    readHandlers: HANDLERS.map(item => {
      const file = module(item.file)
      return {
        handler: item.handler,
        protocol: PROTOCOL,
        moduleUrl: file.moduleUrl,
        codeDigest: file.digest,
        ordering: 'snapshot',
        readTables: item.tables,
        requiresMigrations: item.migrations ?? [migrationRef],
        maxOutputBytes: item.bytes,
        maxRowsRead: item.rows,
      }
    }),
  }
}
