import type { Holder, MediaRow } from '@omne-harness/media-contract'
import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import { ROW_LIMIT } from './schema.ts'

/** One statement at a time, inside the transaction of a commit or of a read; a read refuses a statement with no LIMIT. */
export type SqlPort = Readonly<{ execute(sql: string, params: readonly SqlValue[]): QueryRows }>
export type Row = { -readonly [K in keyof MediaRow]: MediaRow[K] }

const text = (cell: unknown): string => {
  if (typeof cell !== 'string') throw new Error('a media cell is not text')
  return cell
}
const ms = (instant: string | null): number | null =>
  instant === null ? null : Date.parse(instant)
const cells = (row: Row): SqlValue[] => [
  row.state,
  row.digest,
  ms(row.expiresAt),
  JSON.stringify({ ...row, holders: [] }),
]

function holders(port: SqlPort, key: string): Holder[] {
  const found = port.execute(
    `SELECT owner, work, position, purpose FROM md_holds WHERE key = ? ORDER BY rowid LIMIT ${ROW_LIMIT + 1}`,
    [key],
  ).rows
  if (found.length > ROW_LIMIT) throw new Error('more holders than one statement may return')
  return found.map(([owner, work, position, purpose]) => ({
    owner: text(owner),
    work: text(work),
    position: text(position),
    purpose: text(purpose),
  }))
}

export function load(port: SqlPort, key: string): Row | null {
  const found = port.execute('SELECT record FROM md_objects WHERE key = ? LIMIT 1', [key]).rows[0]
  if (found === undefined) return null
  return { ...(JSON.parse(text(found[0])) as Row), holders: holders(port, key) }
}

export function insert(port: SqlPort, row: Row): void {
  port.execute(
    'INSERT INTO md_objects (state, digest, expires_at, record, key) VALUES (?, ?, ?, ?, ?)',
    [...cells(row), row.key],
  )
}

export function save(port: SqlPort, row: Row): void {
  port.execute(
    'UPDATE md_objects SET state = ?, digest = ?, expires_at = ?, record = ? WHERE key = ?',
    [...cells(row), row.key],
  )
}

/** Holds a live row for one more holder and answers it; the same holder again changes nothing. */
export function hold(port: SqlPort, row: Row, holder: Holder): Row {
  port.execute(
    'INSERT OR IGNORE INTO md_holds (key, owner, work, position, purpose) VALUES (?, ?, ?, ?, ?)',
    [row.key, holder.owner, holder.work, holder.position, holder.purpose],
  )
  const held: Row = { ...row, state: 'held', expiresAt: null }
  save(port, held)
  return { ...held, holders: holders(port, row.key) }
}

export function keysWhere(port: SqlPort, where: string, params: readonly SqlValue[]): string[] {
  const found = port.execute(`SELECT key FROM md_objects WHERE ${where}`, params)
  return found.rows.map(row => text(row[0]))
}

export function pointed(port: SqlPort, upload: string): Row | null {
  const found = port.execute('SELECT key FROM md_uploads WHERE upload = ? LIMIT 1', [upload])
    .rows[0]
  return found === undefined ? null : load(port, text(found[0]))
}

export const isLive = (row: Row | null): row is Row =>
  row !== null && (row.state === 'staged' || row.state === 'held')
