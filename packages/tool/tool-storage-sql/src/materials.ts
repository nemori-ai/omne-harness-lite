// The static materials of the Tool storage: its participant, migrations and read handlers,
// as the SQL storage contract describes them (sql-contract §4). The application aggregates these
// with the materials of the other owners into one catalog and declares the combination; this
// member never builds a catalog, a Cordis service or a domain registration.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
  ReadOrdering,
} from '@omne-harness/sql-contract'
import { MATERIAL_READ_HANDLER } from './worker/read-material.ts'
import { MATERIAL_MIGRATION, MATERIAL_TABLES } from './worker/migration-material.ts'
import { MAINTENANCE_MIGRATION, MAINTENANCE_TABLES } from './worker/migration-maintenance.ts'
import { MAINTENANCE_PAGE_LIMIT, MAINTENANCE_READ_HANDLER } from './maintenance-scan-wire.ts'
import {
  BODY_READ_CHUNKS,
  BODY_READ_HANDLER,
  CHUNK_READ_HANDLER,
  DUE_READ_ENTRIES,
  DUE_READ_HANDLER,
  LEDGER_READ_HANDLER,
  LEDGER_READ_ROWS,
  MANIFEST_READ_HANDLER,
  MIGRATION,
  PARTICIPANT,
  PROTOCOL,
  READ_OUTPUT_BYTES,
  TOOL_TABLES,
} from './worker/schema.ts'

/** The participant name that a combination lists for the Tool storage; its tables start with `tl_`. */
export const TOOL_PARTICIPANT = PARTICIPANT

const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js'

function module(name: string): Readonly<{ moduleUrl: string; digest: string }> {
  const moduleUrl = new URL(`./worker/${name}${extension}`, import.meta.url).href
  const digest = createHash('sha256')
    .update(readFileSync(fileURLToPath(moduleUrl)))
    .digest('hex')
  return { moduleUrl, digest }
}

const migrationRef = Object.freeze({ owner: MIGRATION.owner, id: MIGRATION.id })

type Handler = Readonly<{
  handler: string
  file: string
  ordering: ReadOrdering
  tables: readonly string[]
  rows: number
}>

/**
 * The ledger domain read is `domain-serial`: it is ordered after every write admitted before it
 * (sql-contract §9.3, §17). The custody reads are snapshots: a manifest is immutable once committed.
 */
const HANDLERS: readonly Handler[] = [
  {
    handler: MAINTENANCE_READ_HANDLER,
    file: 'read-maintenance',
    ordering: 'domain-serial',
    tables: MAINTENANCE_TABLES,
    rows: MAINTENANCE_PAGE_LIMIT + 2,
  },
  {
    handler: MATERIAL_READ_HANDLER,
    file: 'read-material',
    ordering: 'domain-serial',
    tables: MATERIAL_TABLES,
    rows: 2,
  },
  {
    handler: LEDGER_READ_HANDLER,
    file: 'read-ledger',
    ordering: 'domain-serial',
    tables: ['tl_domain', 'tl_record'],
    rows: LEDGER_READ_ROWS + 2,
  },
  {
    handler: MANIFEST_READ_HANDLER,
    file: 'read-manifest',
    ordering: 'snapshot',
    tables: ['tl_manifest'],
    rows: 1,
  },
  {
    handler: CHUNK_READ_HANDLER,
    file: 'read-chunk',
    ordering: 'snapshot',
    tables: ['tl_chunk'],
    rows: 1,
  },
  {
    handler: BODY_READ_HANDLER,
    file: 'read-body',
    ordering: 'snapshot',
    tables: ['tl_body_manifest', 'tl_body_chunk'],
    rows: BODY_READ_CHUNKS + 1,
  },
  {
    handler: DUE_READ_HANDLER,
    file: 'read-due',
    ordering: 'domain-serial',
    tables: ['tl_due'],
    rows: DUE_READ_ENTRIES,
  },
]

export type ToolStorageMaterials = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
}>

/** Reads the module files once and returns the descriptors with their digests. */
export function toolStorageMaterials(): ToolStorageMaterials {
  const participant = module('participant')
  const migration = module('migration')
  const materialMigration = module('migration-material')
  const maintenanceMigration = module('migration-maintenance')
  return {
    participants: [
      {
        participant: TOOL_PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: [...TOOL_TABLES, ...MATERIAL_TABLES, ...MAINTENANCE_TABLES],
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
        ...MAINTENANCE_MIGRATION,
        moduleUrl: maintenanceMigration.moduleUrl,
        checksum: maintenanceMigration.digest,
        requires: [migrationRef],
      },
      {
        ...MATERIAL_MIGRATION,
        moduleUrl: materialMigration.moduleUrl,
        checksum: materialMigration.digest,
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
        ordering: item.ordering,
        readTables: item.tables,
        requiresMigrations:
          item.handler === MATERIAL_READ_HANDLER
            ? [MATERIAL_MIGRATION]
            : item.handler === MAINTENANCE_READ_HANDLER
              ? [MAINTENANCE_MIGRATION]
              : [migrationRef],
        maxOutputBytes: READ_OUTPUT_BYTES,
        maxRowsRead: item.rows,
      }
    }),
  }
}
