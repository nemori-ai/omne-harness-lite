// The static materials of the Session storage: one participant, one migration and eight read
// handlers, as the SQL storage contract describes them (sql-contract SPEC 4). The application
// aggregates these with the materials of the other owners into one catalog and declares the
// combination; this member never builds a catalog, a Cordis service or a domain registration.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {
  MigrationDescriptor,
  ParticipantDescriptor,
  ReadHandlerDescriptor,
} from '@omne-harness/sql-contract'
import { SESSION_PARTICIPANT } from './participants.ts'
import { MIGRATION, PROTOCOL, SESSION_TABLES } from './worker/schema.ts'

const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js'

function module(name: string): Readonly<{ moduleUrl: string; digest: string }> {
  const moduleUrl = new URL(`./worker/${name}${extension}`, import.meta.url).href
  const digest = createHash('sha256')
    .update(readFileSync(fileURLToPath(moduleUrl)))
    .digest('hex')
  return { moduleUrl, digest }
}

const migrationRef = Object.freeze({ owner: MIGRATION.owner, id: MIGRATION.id })

type Handler = Readonly<{ handler: string; file: string; tables: readonly string[] }>

export const HANDLERS: readonly Handler[] = [
  { handler: 'session.work', file: 'read-work', tables: ['sl_journal', 'sl_state'] },
  { handler: 'session.input', file: 'read-input', tables: ['sl_journal', 'sl_input'] },
  {
    handler: 'session.model-selection',
    file: 'read-model-selection',
    tables: ['sl_journal', 'sl_state', 'sl_entry', 'sl_operation'],
  },
  {
    handler: 'session.history',
    file: 'read-history',
    tables: ['sl_journal', 'sl_entry', 'sl_annotation_idx'],
  },
  {
    handler: 'session.model-view',
    file: 'read-model-view',
    tables: ['sl_journal', 'sl_model_view'],
  },
  { handler: 'session.pending', file: 'read-pending', tables: ['sl_pending_idx'] },
  { handler: 'session.references', file: 'read-references', tables: ['sl_resident_idx'] },
  {
    handler: 'session.released-scopes',
    file: 'read-released-scopes',
    tables: ['sl_released_scope_idx'],
  },
]

export type SessionStorageMaterials = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
}>

/** Reads the module files once and returns the descriptors with their digests. */
export function sessionStorageMaterials(): SessionStorageMaterials {
  const participant = module('participant')
  const migration = module('migration')
  return {
    participants: [
      {
        participant: SESSION_PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: SESSION_TABLES,
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      {
        ...migrationRef,
        moduleUrl: migration.moduleUrl,
        checksum: migration.digest,
        requires: [],
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
        requiresMigrations: [migrationRef],
        maxOutputBytes: 1 << 20,
        maxRowsRead: 2000,
      }
    }),
  }
}
