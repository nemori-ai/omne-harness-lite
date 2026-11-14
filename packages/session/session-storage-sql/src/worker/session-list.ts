// The time of each commit and the session list item (SPEC「提交的时刻与会话列表」). The `session`
// participant calls these in the transaction that writes the batch; the migration `008` calls
// `titleOf` to backfill. Nothing here reads a clock: the time comes in the facts.
import type { HistoryEntry, WorkSnapshot } from '@omne-harness/session-contract'
import { plainOf } from '../codec.ts'
import { oneRow, type Executor } from './support.ts'

/** The computation version of a list item. Add one when a rule of the computation changes. */
export const SESSION_LIST_VERSION = 1n
/** The characters of a title, counted in code points. */
const TITLE_CHARACTERS = 80

/** The entry kinds that make a commit an activity, besides creating the session. */
const ACTIVITY_KINDS: ReadonlySet<string> = new Set(['intake.routed', 'run.terminal'])

/** The title of one text: whitespace collapsed to one space and trimmed, at most 80 characters. */
function titleText(value: string): string | null {
  const collapsed = value.replace(/\s+/gu, ' ').trim()
  return collapsed === '' ? null : Array.from(collapsed).slice(0, TITLE_CHARACTERS).join('')
}

/** The title of the first user message of `entries` with text, or null. */
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

const nullable = (cell: unknown): string | null => (cell === null ? null : String(cell))

/**
 * Writes the time row of this commit and the list item of its session, in the transaction of the
 * batch. `previous` null is the commit that creates the session.
 */
export function writeSessionList(
  port: Executor,
  batch: Readonly<{
    tenant: string
    session: string
    seq: bigint
    at: string | null
    previous: WorkSnapshot | null
    snapshot: WorkSnapshot
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
}
