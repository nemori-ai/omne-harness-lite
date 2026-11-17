import type { HistoryEntry, WorkSnapshot } from '@omne-harness/session-contract'
import { plainOf } from '../codec.ts'
import { oneRow, type Executor } from './support.ts'

export const SESSION_LIST_VERSION = 1n
const TITLE_CHARACTERS = 80

const ACTIVITY_KINDS: ReadonlySet<string> = new Set(['intake.routed', 'run.terminal'])

function titleText(value: string): string | null {
  const collapsed = value.replace(/\s+/gu, ' ').trim()
  return collapsed === '' ? null : Array.from(collapsed).slice(0, TITLE_CHARACTERS).join('')
}

export function titleOf(entries: Iterable<HistoryEntry>): string | null {
  for (const entry of entries) {
    if (entry.kind !== 'message.user') continue
    const message = (plainOf(entry.payload) as { message?: { blocks?: unknown } } | null)?.message
    const blocks = Array.isArray(message?.blocks) ? (message.blocks as unknown[]) : []
    for (const block of blocks) {
      const { kind, text } = (block ?? {}) as { kind?: unknown; text?: unknown }
      if (kind !== 'text' || typeof text !== 'string') continue
      const title = titleText(text)
      if (title !== null) return title
    }
  }
  return null
}

const nullable = (cell: unknown): string | null =>
  cell === null || cell === undefined ? null : String(cell)

// How this commit archived the session: the idle rule asks for an auto-archive, a person archives.
export function howArchived(entries: readonly HistoryEntry[]): 'person' | 'auto' {
  const automatic = entries.some(entry => {
    if (entry.kind !== 'control.requested') return false
    const payload = plainOf(entry.payload) as { progress?: { intent?: { kind?: unknown } } }
    return payload.progress?.intent?.kind === 'auto-archive'
  })
  return automatic ? 'auto' : 'person'
}

// The archive row moves with the lifecycle: written by the commit that archives, gone on unarchive.
function writeArchive(
  port: Executor,
  scope: Readonly<{ tenant: string; session: string }>,
  change: Readonly<{
    previous: Pick<WorkSnapshot, 'lifecycle'> | null
    snapshot: Pick<WorkSnapshot, 'lifecycle'>
    at: string | null
  }>,
  entries: readonly HistoryEntry[],
): void {
  const { tenant, session } = scope
  const was = change.previous?.lifecycle === 'archived'
  const is = change.snapshot.lifecycle === 'archived'
  if (was && !is)
    port.execute('DELETE FROM sl_session_archive WHERE tenant = ? AND session = ?', [
      tenant,
      session,
    ])
  if (was || !is) return
  port.execute(
    'INSERT OR REPLACE INTO sl_session_archive (tenant, session, archived_at, archived_by) VALUES (?, ?, ?, ?)',
    [tenant, session, change.at, howArchived(entries)],
  )
}

export function writeSessionList(
  port: Executor,
  batch: Readonly<{
    tenant: string
    session: string
    seq: bigint
    at: string | null
    previous: Pick<WorkSnapshot, 'lifecycle'> | null
    snapshot: Pick<WorkSnapshot, 'lifecycle'>
    entries: readonly HistoryEntry[]
  }>,
): void {
  const { tenant, session, seq, at, previous, snapshot, entries } = batch
  port.execute('INSERT INTO sl_commit_time (tenant, session, commit_seq, at) VALUES (?, ?, ?, ?)', [
    tenant,
    session,
    seq,
    at,
  ])
  const row = oneRow(
    port,
    'SELECT created_at, last_activity_at, title FROM sl_session_list WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  const creates = previous === null
  const active = creates || entries.some(entry => ACTIVITY_KINDS.has(entry.kind))
  const createdAt = creates ? at : nullable(row?.['created_at'] ?? null)
  const lastActivityAt = active ? at : nullable(row?.['last_activity_at'] ?? null)
  const title = nullable(row?.['title'] ?? null) ?? titleOf(entries)
  port.execute(
    'INSERT OR REPLACE INTO sl_session_list (tenant, session, created_at, last_activity_at, lifecycle, title, version) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [tenant, session, createdAt, lastActivityAt, snapshot.lifecycle, title, SESSION_LIST_VERSION],
  )
  writeArchive(port, { tenant, session }, { previous, snapshot, at }, entries)
}
