import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { DISPATCH_MIGRATION, DISPATCH_TABLES } from './dispatch-schema.ts'

export default {
  ...DISPATCH_MIGRATION,
  up(port) {
    port.execute(
      'CREATE TABLE sc_watch (owner TEXT PRIMARY KEY, beat_at TEXT NOT NULL, watch_from TEXT NOT NULL)',
      [],
    )
    port.execute(
      'CREATE TABLE sc_dispatch (owner TEXT NOT NULL, schedule_id TEXT NOT NULL, revision INTEGER NOT NULL, next_at TEXT, state TEXT NOT NULL, PRIMARY KEY(owner, schedule_id))',
      [],
    )
    port.execute('CREATE INDEX sc_dispatch_due ON sc_dispatch(owner, next_at)', [])
    port.execute(
      'CREATE TABLE sc_receipts (owner TEXT NOT NULL, schedule_id TEXT NOT NULL, slot_at TEXT NOT NULL, receipt TEXT NOT NULL, job_id TEXT, PRIMARY KEY(owner, schedule_id, slot_at))',
      [],
    )
    port.execute(
      'CREATE TABLE sc_sources (owner TEXT NOT NULL, schedule_id TEXT NOT NULL, source_key TEXT NOT NULL, slot_at TEXT NOT NULL, PRIMARY KEY(owner, schedule_id, source_key))',
      [],
    )
    port.execute(
      'CREATE TABLE sc_jobs (owner TEXT NOT NULL, job_id TEXT NOT NULL, schedule_id TEXT NOT NULL, slot_at TEXT NOT NULL, state TEXT NOT NULL, job TEXT NOT NULL, PRIMARY KEY(owner, job_id))',
      [],
    )
    port.execute(
      "CREATE INDEX sc_jobs_open ON sc_jobs(owner, state) WHERE state <> 'concluded'",
      [],
    )
    port.execute('CREATE INDEX sc_jobs_schedule ON sc_jobs(owner, schedule_id, slot_at)', [])
    port.execute(
      'CREATE TABLE sc_job_events (owner TEXT NOT NULL, job_id TEXT NOT NULL, seq INTEGER NOT NULL, event TEXT NOT NULL, PRIMARY KEY(owner, job_id, seq))',
      [],
    )
    port.execute(
      'CREATE TABLE sc_lapses (owner TEXT NOT NULL, schedule_id TEXT NOT NULL, from_at TEXT NOT NULL, through_at TEXT NOT NULL, lapse TEXT NOT NULL, PRIMARY KEY(owner, schedule_id, from_at))',
      [],
    )
  },
  verify(port) {
    for (const table of DISPATCH_TABLES) port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
