import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { MIGRATION, TABLES } from './schema.ts'

const STATEMENTS = [
  'CREATE TABLE nt_sends (source TEXT NOT NULL, event_id TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(source, event_id))',
  'CREATE TABLE nt_recipients (recipient TEXT PRIMARY KEY, record TEXT NOT NULL)',
  'CREATE TABLE nt_beats (recipient TEXT PRIMARY KEY, beat TEXT NOT NULL)',
  'CREATE TABLE nt_notifications (recipient TEXT NOT NULL, source TEXT NOT NULL, event_id TEXT NOT NULL, sequence INTEGER NOT NULL, strong INTEGER NOT NULL, quiet INTEGER NOT NULL, unresolved INTEGER NOT NULL, replace_key TEXT, record TEXT NOT NULL, marks TEXT NOT NULL, PRIMARY KEY(recipient, source, event_id))',
  'CREATE UNIQUE INDEX nt_notifications_box ON nt_notifications(recipient, sequence)',
  'CREATE INDEX nt_notifications_open ON nt_notifications(recipient, unresolved, sequence)',
  'CREATE INDEX nt_notifications_key ON nt_notifications(recipient, source, replace_key)',
  'CREATE TABLE nt_subscriptions (recipient TEXT NOT NULL, source TEXT NOT NULL, type TEXT NOT NULL, scope TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(recipient, source, type, scope))',
  'CREATE INDEX nt_subscriptions_type ON nt_subscriptions(source, type)',
  'CREATE TABLE nt_destinations (recipient TEXT NOT NULL, id TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(recipient, id))',
  'CREATE TABLE nt_units (id TEXT PRIMARY KEY, pending INTEGER NOT NULL, due_at TEXT NOT NULL, record TEXT NOT NULL)',
  'CREATE INDEX nt_units_due ON nt_units(pending, due_at)',
  'CREATE TABLE nt_reminders (recipient TEXT NOT NULL, item TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(recipient, item))',
  'CREATE TABLE nt_counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)',
]

export default {
  ...MIGRATION,
  up(port) {
    for (const statement of STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    for (const table of TABLES) port.execute(`SELECT * FROM ${table} LIMIT 0`, [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
