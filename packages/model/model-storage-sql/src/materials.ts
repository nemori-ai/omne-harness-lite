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

type Handler = Readonly<{
  handler: string
  file: string
  tables: readonly string[]
  rows: number
  bytes: number
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
]

export type ModelStorageMaterials = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
}>

export function modelStorageMaterials(): ModelStorageMaterials {
  const participant = module('commit')
  const migration = module('schema')
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
        grouping: 'singleton',
      },
    ],
    migrations: [
      { ...migrationRef, moduleUrl: migration.moduleUrl, checksum: migration.digest, requires: [] },
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
        requiresMigrations: [migrationRef],
        maxOutputBytes: item.bytes,
        maxRowsRead: item.rows,
      }
    }),
  }
}
