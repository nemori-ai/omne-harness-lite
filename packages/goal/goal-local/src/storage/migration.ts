import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { MIGRATION, TABLES } from './schema.ts'

const STATEMENTS = [
  'CREATE TABLE gl_goals (session TEXT NOT NULL, generation INTEGER NOT NULL, version INTEGER NOT NULL, live INTEGER NOT NULL, owing INTEGER NOT NULL, record TEXT NOT NULL, PRIMARY KEY (session, generation))',
  // A session has one live goal at most: the store refuses a second one whatever a script decided.
  'CREATE UNIQUE INDEX gl_goals_live ON gl_goals(session) WHERE live = 1',
  'CREATE INDEX gl_goals_owing ON gl_goals(owing, session)',
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
