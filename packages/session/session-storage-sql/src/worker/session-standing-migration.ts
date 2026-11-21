// Rebuilds the session list with its standing columns and their indexes, then backfills each row
// from the creation entry of its session: the directory is a projection of the log.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { plainOf } from '../codec.ts'
import { STANDING_COLUMN_NAMES } from './list-standing.ts'
import { readEntryText } from '../entry-codec.ts'
import { SESSION_STANDING_MIGRATION, SESSION_STANDING_STATEMENTS } from './schema.ts'
import { standingColumns, type CreatedStanding } from './session-list.ts'
import { oneRow, packed, rowsOf, text, type Executor, type Scope } from './support.ts'

const PAGE = 200
const COLUMNS = STANDING_COLUMN_NAMES

function backfillSession(port: Executor, scope: Scope): void {
  const where = [scope.tenant, scope.session] as const
  const created = oneRow(
    port,
    `SELECT entry FROM sl_entry WHERE tenant = ? AND session = ? AND kind = 'session.created'
      ORDER BY position LIMIT 1`,
    where,
  )
  if (created === undefined) throw new Error('session standing migration found no creation entry')
  const entry = readEntryText(packed(created['entry']), 'sl_entry session.created')
  const { creation, tree } = plainOf(entry.payload) as CreatedStanding
  const { relation, attendance } = creation
  const standing = {
    ...(relation === undefined ? {} : { relation }),
    ...(attendance === undefined ? {} : { attendance }),
    ...(tree === undefined ? {} : { tree }),
  }
  port.execute(
    `UPDATE sl_session_list SET ${COLUMNS.map(column => `${column} = ?`).join(', ')}
      WHERE tenant = ? AND session = ?`,
    [...standingColumns(scope.session, standing, creation.definition.name), ...where],
  )
}

function backfill(port: Executor): void {
  let tenant = ''
  let session = ''
  for (;;) {
    const rows = rowsOf(
      port,
      `SELECT tenant, session FROM sl_session_list WHERE (tenant, session) > (?, ?)
        ORDER BY tenant, session LIMIT ${PAGE}`,
      [tenant, session],
    )
    for (const row of rows) {
      tenant = text(row['tenant'])
      session = text(row['session'])
      backfillSession(port, { tenant, session })
    }
    if (rows.length < PAGE) return
  }
}

const migration: MigrationModule = {
  ...SESSION_STANDING_MIGRATION,
  up(port) {
    for (const statement of SESSION_STANDING_STATEMENTS) port.execute(statement, [])
    backfill(port)
  },
  verify(port) {
    port.execute(`SELECT ${COLUMNS.join(', ')} FROM sl_session_list LIMIT 0`, [])
    return { kind: 'verified' }
  },
}
export default migration
