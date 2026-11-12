import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { MIGRATION, TABLES } from './schema.ts'

export default {
  ...MIGRATION,
  up(port) {
    port.execute(
      'CREATE TABLE sc_schedules (owner TEXT NOT NULL, schedule_id TEXT NOT NULL, author TEXT NOT NULL, agent_ref TEXT, control TEXT NOT NULL, standing TEXT NOT NULL, created_by TEXT NOT NULL, device_ref TEXT, calendar_id TEXT, purpose TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(owner, schedule_id))',
      [],
    )
    port.execute(
      'CREATE INDEX sc_schedules_filters ON sc_schedules(owner, control, standing, schedule_id)',
      [],
    )
    port.execute('CREATE INDEX sc_schedules_author ON sc_schedules(owner, author, schedule_id)', [])
    port.execute(
      'CREATE TABLE sc_definitions (owner TEXT NOT NULL, schedule_id TEXT NOT NULL, revision INTEGER NOT NULL, definition_ref TEXT NOT NULL, definition TEXT NOT NULL, PRIMARY KEY(owner, schedule_id, revision))',
      [],
    )
    port.execute(
      'CREATE TABLE sc_revisions (owner TEXT NOT NULL, schedule_id TEXT NOT NULL, revision INTEGER NOT NULL, record TEXT NOT NULL, PRIMARY KEY(owner, schedule_id, revision))',
      [],
    )
    port.execute(
      'CREATE TABLE sc_observations (owner TEXT PRIMARY KEY, revision INTEGER NOT NULL)',
      [],
    )
    port.execute(
      'CREATE TABLE sc_operations (operation_ref TEXT PRIMARY KEY, recovery_scope TEXT NOT NULL, binding TEXT NOT NULL, result TEXT NOT NULL)',
      [],
    )
    port.execute(
      'CREATE TABLE sc_outbox (owner TEXT NOT NULL, operation_ref TEXT NOT NULL, schedule_id TEXT NOT NULL, revision INTEGER NOT NULL, event TEXT NOT NULL, PRIMARY KEY(owner, operation_ref, schedule_id))',
      [],
    )
  },
  verify(port) {
    for (const table of TABLES) port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
