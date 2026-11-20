import {
  standingOf,
  type HistoryEntry,
  type SessionCreation,
  type SessionTree,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import { plainOf } from '../codec.ts'
import { STANDING_COLUMNS } from './list-standing.ts'
import { oneRow, type Executor } from './support.ts'

export const SESSION_LIST_VERSION = 1n
const VERSION = SESSION_LIST_VERSION
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

// How this commit archived the session: the idle rule asks for an auto-archive, an archive that names a parent follows it, a person archives.
export function howArchived(entries: readonly HistoryEntry[]): 'person' | 'auto' | 'parent' {
  type Intent = { kind?: unknown; value?: { kind?: unknown; cascade?: unknown } }
  const intents = entries
    .filter(entry => entry.kind === 'control.requested')
    .map(entry => (plainOf(entry.payload) as { progress?: { intent?: Intent } }).progress?.intent)
  if (intents.some(intent => intent?.kind === 'auto-archive')) return 'auto'
  const follows = (intent: Intent | undefined): boolean =>
    intent?.value?.kind === 'archive' && intent.value.cascade !== undefined
  return intents.some(follows) ? 'parent' : 'person'
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

type Standing = Pick<WorkSnapshot, 'relation' | 'attendance' | 'tree'>
/** What a creation entry says of the standing of its session, as the migration reads it. */
export type CreatedStanding = Readonly<{
  creation: Pick<SessionCreation, 'relation' | 'attendance' | 'definition'>
  tree?: SessionTree
}>

/** The standing columns of one list row, in the order of the schema. */
export function standingColumns(
  session: string,
  standing: Standing,
  definition: string,
): readonly SqlValue[] {
  const { relation, attendance, tree } = standingOf({ session, ...standing } as WorkSnapshot)
  return [
    relation.kind,
    relation.kind === 'child' ? relation.parent : null,
    relation.kind === 'handoff' ? relation.origin : null,
    tree.root,
    BigInt(tree.depth),
    attendance,
    definition,
  ]
}

/** The standing is read only from the snapshot of the commit that creates the session. */
type Listed = Pick<WorkSnapshot, 'lifecycle'> & Partial<Pick<WorkSnapshot, 'definition'>> & Standing

export function writeSessionList(
  port: Executor,
  batch: Readonly<{
    tenant: string
    session: string
    seq: bigint
    at: string | null
    previous: Pick<WorkSnapshot, 'lifecycle'> | null
    snapshot: Listed
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
  const active = previous === null || entries.some(entry => ACTIVITY_KINDS.has(entry.kind))
  const lastActivityAt = active ? at : nullable(row?.['last_activity_at'] ?? null)
  const title = nullable(row?.['title'] ?? null) ?? titleOf(entries)
  if (row === undefined) {
    if (snapshot.definition === undefined) throw new Error('a list row needs the definition')
    const standing = standingColumns(session, snapshot, snapshot.definition.name)
    const created = previous === null ? at : null
    port.execute(
      `INSERT INTO sl_session_list (tenant, session, created_at, last_activity_at, lifecycle, title, version, ${STANDING_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenant, session, created, lastActivityAt, snapshot.lifecycle, title, VERSION, ...standing],
    )
  } else
    port.execute(
      'UPDATE sl_session_list SET last_activity_at = ?, lifecycle = ?, title = ?, version = ? WHERE tenant = ? AND session = ?',
      [lastActivityAt, snapshot.lifecycle, title, VERSION, tenant, session],
    )
  writeArchive(port, { tenant, session }, { previous, snapshot, at }, entries)
}
