import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { MIGRATION, TABLES } from './schema.ts'

export default {
  ...MIGRATION,
  up(port) {
    port.execute(
      'CREATE TABLE ca_current (calendar_id TEXT PRIMARY KEY, version_id TEXT NOT NULL, generation INTEGER NOT NULL, directory TEXT NOT NULL)',
      [],
    )
    port.execute(
      'CREATE TABLE ca_versions (calendar_id TEXT NOT NULL, version_id TEXT NOT NULL, snapshot_digest TEXT NOT NULL, version_info TEXT NOT NULL, operation_ref TEXT NOT NULL, PRIMARY KEY (calendar_id, version_id))',
      [],
    )
    port.execute('CREATE TABLE ca_snapshots (digest TEXT PRIMARY KEY, snapshot TEXT NOT NULL)', [])
    port.execute(
      'CREATE TABLE ca_candidates (sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_ref TEXT NOT NULL UNIQUE, calendar_id TEXT NOT NULL, fingerprint TEXT NOT NULL, snapshot_digest TEXT, canonical_command TEXT NOT NULL, record TEXT NOT NULL)',
      [],
    )
    port.execute('CREATE INDEX ca_candidates_calendar ON ca_candidates(calendar_id, sequence)', [])
    port.execute(
      'CREATE TABLE ca_outbox (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, operation_ref TEXT NOT NULL, system_scope_ref TEXT NOT NULL, record TEXT NOT NULL, handoff_ref TEXT)',
      [],
    )
    port.execute(
      'CREATE INDEX ca_outbox_pending ON ca_outbox(system_scope_ref, sequence) WHERE handoff_ref IS NULL',
      [],
    )
  },
  verify(port) {
    for (const table of TABLES) {
      port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    }
    return { kind: 'verified' }
  },
} satisfies MigrationModule
