import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { MIGRATION, TABLES } from './schema.ts'

const STATEMENTS = [
  'CREATE TABLE dp_dispatches (id TEXT PRIMARY KEY, dispatcher TEXT NOT NULL, session TEXT NOT NULL, state TEXT NOT NULL, open INTEGER NOT NULL, unfinished INTEGER NOT NULL, accepted_at TEXT NOT NULL, record TEXT NOT NULL)',
  'CREATE UNIQUE INDEX dp_dispatches_session ON dp_dispatches(session)',
  'CREATE INDEX dp_dispatches_dispatcher ON dp_dispatches(dispatcher, open)',
  'CREATE INDEX dp_dispatches_unfinished ON dp_dispatches(unfinished, accepted_at)',
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
