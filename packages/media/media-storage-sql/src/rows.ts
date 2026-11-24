import type { Holder, MediaRow, Provenance, Representation } from '@omne-harness/media-contract'
import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'

/** One statement at a time, inside the transaction of a commit or of a read; a read refuses a statement with no LIMIT. */
export type SqlPort = Readonly<{ execute(sql: string, params: readonly SqlValue[]): QueryRows }>
export type Row = { -readonly [K in keyof MediaRow]: MediaRow[K] }
/** What the record column keeps: the holders are rows of their own, counted when a row is read. */
export type Stored = Omit<Row, 'holderCount'>

const ms = (instant: string | null): number | null =>
  instant === null ? null : Date.parse(instant)
function cells(row: Stored & { holderCount?: number }): SqlValue[] {
  const { holderCount: _, ...stored } = row
  return [row.state, row.digest, ms(row.expiresAt), JSON.stringify(stored)]
}

export function load(port: SqlPort, key: string): Row | null {
  const found = port.execute('SELECT record FROM md_objects WHERE key = ? LIMIT 1', [key]).rows[0]
  if (found === undefined) return null
  const held = port.execute('SELECT COUNT(*) FROM md_holds WHERE key = ? LIMIT 1', [key]).rows[0]
  return { ...(JSON.parse(String(found[0])) as Stored), holderCount: Number(held?.[0]) }
}

export function insert(port: SqlPort, row: Stored): void {
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
  save(port, { ...row, state: 'held', expiresAt: null })
  return load(port, row.key) as Row
}

export function keysWhere(port: SqlPort, where: string, params: readonly SqlValue[]): string[] {
  const found = port.execute(`SELECT key FROM md_objects WHERE ${where}`, params)
  return found.rows.map(row => String(row[0]))
}

export function pointed(port: SqlPort, upload: string): Row | null {
  const [key] = port.execute('SELECT key FROM md_uploads WHERE upload = ? LIMIT 1', [upload]).rows
  return key === undefined ? null : load(port, String(key[0]))
}

export const isLive = (row: Row | null): row is Row =>
  row !== null && (row.state === 'staged' || row.state === 'held')

export function representationOf(
  port: SqlPort,
  key: string,
  definition: Provenance,
): Representation | null {
  const found = port.execute(
    'SELECT record FROM md_representations WHERE key = ? AND definition = ? AND revision = ? LIMIT 1',
    [key, definition.name, definition.revision],
  ).rows[0]
  return found === undefined ? null : (JSON.parse(String(found[0])) as Representation)
}

/** Ends what was kept for the representations of a row that goes; answers the rows left with no holder. */
export function released(port: SqlPort, original: string, owner: string): Row[] {
  port.execute('DELETE FROM md_representations WHERE key = ?', [original])
  const held = port.execute('SELECT key FROM md_holds WHERE owner = ? AND work = ?', [
    owner,
    original,
  ])
  port.execute('DELETE FROM md_holds WHERE owner = ? AND work = ?', [owner, original])
  const orphans: Row[] = []
  for (const key of new Set(held.rows.map(row => String(row[0])))) {
    const row = load(port, key)
    if (row === null || row.state !== 'held' || row.holderCount > 0) continue
    const gone: Row = { ...row, state: 'deleting' }
    save(port, gone)
    orphans.push(gone)
  }
  return orphans
}
