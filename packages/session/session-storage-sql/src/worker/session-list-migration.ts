// The migration of the commit times and the session list (SPEC「提交的时刻与会话列表」). It creates the
// two tables and the activity index, then backfills one list item for each session that is already
// there, in the migration transaction: the lifecycle from the snapshot head, the title from the
// log, both times null. The precedent is `006-permission-current`.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { readEntryText } from '../entry-codec.ts'
import { SESSION_LIST_MIGRATION, SESSION_LIST_STATEMENTS, SESSION_LIST_TABLES } from './schema.ts'
import { SESSION_LIST_VERSION, titleOf } from './session-list.ts'
import { big, oneRow, packed, rowsOf, text, type Executor, type Scope } from './support.ts'

const PAGE = 200

/** The user messages of one session in position order, read a page at a time. */
function* userMessages(port: Executor, scope: Scope) {
  let after = -1n
  for (;;) {
    const rows = rowsOf(
      port,
      `SELECT position, entry FROM sl_entry
        WHERE tenant = ? AND session = ? AND kind = 'message.user' AND position > ?
        ORDER BY position LIMIT ${PAGE}`,
      [scope.tenant, scope.session, after],
    )
    for (const row of rows) {
      after = big(row['position'])
      yield readEntryText(packed(row['entry']), `sl_entry ${after}`)
    }
    if (rows.length < PAGE) return
  }
}

function backfillSession(port: Executor, scope: Scope): void {
  const existing = oneRow(
    port,
    'SELECT session FROM sl_session_list WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (existing !== undefined) return
  const state = oneRow(
    port,
    'SELECT snapshot FROM sl_state WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (state === undefined) throw new Error('session list migration requires a Session snapshot')
  const { lifecycle } = JSON.parse(text(state['snapshot'])) as { lifecycle?: unknown }
  if (typeof lifecycle !== 'string')
    throw new Error('session list migration found a snapshot without a lifecycle')
  port.execute(
    'INSERT INTO sl_session_list (tenant, session, created_at, last_activity_at, lifecycle, title, version) VALUES (?, ?, NULL, NULL, ?, ?, ?)',
    [
      scope.tenant,
      scope.session,
      lifecycle,
      titleOf(userMessages(port, scope)),
      SESSION_LIST_VERSION,
    ],
  )
}

/** One list item for every session of every tenant in this domain, 200 sessions a page. */
function backfillSessionList(port: Executor): void {
  let tenant = ''
  let session = ''
  for (;;) {
    const rows = rowsOf(
      port,
      `SELECT tenant, session FROM sl_journal WHERE (tenant, session) > (?, ?)
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
  ...SESSION_LIST_MIGRATION,
  up(port) {
    for (const statement of SESSION_LIST_STATEMENTS) port.execute(statement, [])
    backfillSessionList(port)
  },
  verify(port) {
    const found = rowsOf(
      port,
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('sl_commit_time', 'sl_session_list') LIMIT 2`,
    )
    const names = new Set(found.map(row => text(row['name'])))
    const missing = SESSION_LIST_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
