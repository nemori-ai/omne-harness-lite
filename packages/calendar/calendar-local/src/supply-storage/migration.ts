import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { MIGRATION, TABLES } from './schema.ts'
export default {
  ...MIGRATION,
  up(port) {
    port.execute(
      'CREATE TABLE ca_supply_runs (sequence INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, calendar TEXT NOT NULL, operation_ref TEXT NOT NULL, fingerprint TEXT NOT NULL, record TEXT NOT NULL, completion TEXT, outcome TEXT, completed_at TEXT, UNIQUE(scope,operation_ref))',
      [],
    )
    port.execute(
      'CREATE INDEX ca_supply_runs_health ON ca_supply_runs(scope,calendar,sequence)',
      [],
    )
    port.execute(
      'CREATE INDEX ca_supply_runs_pending ON ca_supply_runs(scope,sequence) WHERE completion IS NULL',
      [],
    )
    port.execute(
      'CREATE TABLE ca_supply_probes (scope TEXT NOT NULL, calendar TEXT NOT NULL, operation_key TEXT NOT NULL, fingerprint TEXT NOT NULL, payload TEXT NOT NULL, standing TEXT NOT NULL, PRIMARY KEY(scope,calendar,operation_key))',
      [],
    )
    port.execute(
      'CREATE TABLE ca_supply_sources (scope TEXT NOT NULL, calendar TEXT NOT NULL, source TEXT NOT NULL, observed_at TEXT NOT NULL, next_due TEXT NOT NULL, due_input TEXT NOT NULL, standing TEXT NOT NULL, PRIMARY KEY(scope,calendar,source))',
      [],
    )
    port.execute(
      'CREATE INDEX ca_supply_sources_due ON ca_supply_sources(scope,next_due,calendar,source)',
      [],
    )
    port.execute(
      'CREATE TABLE ca_supply_acks (scope TEXT NOT NULL, id TEXT NOT NULL, acknowledgement_key TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(scope,id,acknowledgement_key))',
      [],
    )
    port.execute(
      'CREATE TABLE ca_supply_materials (scope TEXT NOT NULL, reference TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(scope,reference))',
      [],
    )
  },
  verify(port) {
    for (const table of TABLES) port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
