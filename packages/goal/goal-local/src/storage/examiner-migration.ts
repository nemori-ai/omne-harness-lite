import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { EXAMINER_MIGRATION } from './schema.ts'

const STATEMENTS = [
  'ALTER TABLE gl_goals ADD COLUMN examiner TEXT',
  // A session examines for one live goal at most; a goal kept before this column has no examining session.
  'CREATE INDEX gl_goals_examiner ON gl_goals(examiner) WHERE examiner IS NOT NULL AND live = 1',
]

export default {
  ...EXAMINER_MIGRATION,
  up(port) {
    for (const statement of STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    port.execute('SELECT examiner FROM gl_goals LIMIT 0', [])
    return { kind: 'verified' }
  },
} satisfies MigrationModule
