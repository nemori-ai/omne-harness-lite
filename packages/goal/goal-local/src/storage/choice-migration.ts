import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { CHOICE_MIGRATION } from './schema.ts'

// A session has one choice of decision model at most; a session that chose none has no row.
const STATEMENT =
  'CREATE TABLE gl_session_choices (session TEXT PRIMARY KEY NOT NULL, judge TEXT NOT NULL)'

export default {
  ...CHOICE_MIGRATION,
  up(port) {
    port.execute(STATEMENT, [])
  },
  verify(port) {
    port.execute('SELECT session, judge FROM gl_session_choices LIMIT 0', [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
