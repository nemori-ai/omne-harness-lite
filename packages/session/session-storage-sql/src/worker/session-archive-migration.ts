// The migration of when and how a session was archived (SPEC「已归档的会话」). It creates the table,
// then backfills one row for each session that is archived already, from the commit that archived
// it: that commit's time where the commit times have it, and who asked from its control request.
// A commit's sequence and the revision of its entries advance together from 1 (`positioned`).
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import { readEntryText } from '../entry-codec.ts'
import { SESSION_ARCHIVE_MIGRATION, SESSION_ARCHIVE_STATEMENTS } from './schema.ts'
import { howArchived } from './session-list.ts'
import { oneRow, packed, rowsOf, text, type Executor, type Scope } from './support.ts'

const PAGE = 200

function backfillSession(port: Executor, scope: Scope): void {
  const where = [scope.tenant, scope.session] as const
  const archiving = oneRow(
    port,
    `SELECT revision FROM sl_entry WHERE tenant = ? AND session = ? AND kind = 'session.archived'
      ORDER BY position DESC LIMIT 1`,
    where,
  )
  if (archiving === undefined) return
  const revision = archiving['revision'] ?? null
  const time = oneRow(
    port,
    'SELECT at FROM sl_commit_time WHERE tenant = ? AND session = ? AND commit_seq = ? LIMIT 1',
    [...where, revision],
  )
  const requests = rowsOf(
    port,
    `SELECT entry FROM sl_entry WHERE tenant = ? AND session = ? AND kind = 'control.requested'
      AND revision = ? ORDER BY position LIMIT ${PAGE}`,
    [...where, revision],
  ).map(row => readEntryText(packed(row['entry']), 'sl_entry control.requested'))
  const at = time?.['at']
  port.execute(
    'INSERT INTO sl_session_archive (tenant, session, archived_at, archived_by) VALUES (?, ?, ?, ?)',
    [...where, at === undefined || at === null ? null : text(at), howArchived(requests)],
  )
}

function backfillArchive(port: Executor): void {
  let tenant = ''
  let session = ''
  for (;;) {
    const rows = rowsOf(
      port,
      `SELECT tenant, session FROM sl_session_list
        WHERE lifecycle = 'archived' AND (tenant, session) > (?, ?)
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
  ...SESSION_ARCHIVE_MIGRATION,
  up(port) {
    for (const statement of SESSION_ARCHIVE_STATEMENTS) port.execute(statement, [])
    backfillArchive(port)
  },
  verify(port) {
    const found = rowsOf(
      port,
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'sl_session_archive' LIMIT 1`,
    )
    return found.length === 1
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'missing table: sl_session_archive' }
  },
}
export default migration
