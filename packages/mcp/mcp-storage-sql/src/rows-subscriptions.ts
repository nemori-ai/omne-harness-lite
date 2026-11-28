import type { SqlPort } from './rows.ts'

export type SubscriptionCells = Readonly<{ tenant: string; subKey: string }>

type Stored = Readonly<{
  revision: number
  cursor: string | null
  delivered: number
  row: unknown
}>

const LISTED = 1000

export function loadSubscription(port: SqlPort, cells: SubscriptionCells): Stored | null {
  const found = port.execute(
    'SELECT revision, cursor, delivered, row FROM mcp_subscriptions WHERE tenant = ? AND sub_key = ? LIMIT 1',
    [cells.tenant, cells.subKey],
  ).rows[0]
  if (found === undefined) return null
  const cursor = found[1] === null ? null : String(found[1])
  const row = JSON.parse(String(found[3])) as unknown
  return { revision: Number(found[0]), cursor, delivered: Number(found[2]), row }
}

export function listSubscriptions(port: SqlPort, tenant: string) {
  return port
    .execute(
      `SELECT sub_key, revision, cursor, delivered, row FROM mcp_subscriptions WHERE tenant = ? ORDER BY sub_key LIMIT ${String(LISTED)}`,
      [tenant],
    )
    .rows.map(row => ({
      subKey: String(row[0]),
      revision: Number(row[1]),
      cursor: row[2] === null ? null : String(row[2]),
      delivered: Number(row[3]),
      row: JSON.parse(String(row[4])) as unknown,
    }))
}

/** Writes the row at its revision; the position stays as the batches left it. */
export function saveSubscription(
  port: SqlPort,
  cells: SubscriptionCells,
  revision: number,
  cursor: string | null,
  row: unknown,
): void {
  port.execute(
    'INSERT INTO mcp_subscriptions (tenant, sub_key, revision, cursor, row) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant, sub_key) DO UPDATE SET revision = excluded.revision, row = excluded.row',
    [cells.tenant, cells.subKey, revision, cursor, JSON.stringify(row)],
  )
}

export function dropSubscription(port: SqlPort, cells: SubscriptionCells): void {
  for (const table of ['mcp_subscriptions', 'mcp_occurrences'])
    port.execute(`DELETE FROM ${table} WHERE tenant = ? AND sub_key = ?`, [
      cells.tenant,
      cells.subKey,
    ])
}

export type Batch = Readonly<{
  events: readonly Readonly<{ eventId: string; row: unknown }>[]
  cursor: string | null
  gap: string | null
  at: string
  floor: string
  maxEvents: number
}>

function next(port: SqlPort, cells: SubscriptionCells): number {
  const found = port.execute(
    'SELECT MAX(seq) FROM mcp_occurrences WHERE tenant = ? AND sub_key = ?',
    [cells.tenant, cells.subKey],
  ).rows[0]
  return Number(found?.[0] ?? 0) + 1
}

function insert(
  port: SqlPort,
  cells: SubscriptionCells,
  seq: number,
  kind: 'event' | 'gap' | 'ended',
  eventId: string | null,
  at: string,
  row: unknown,
): void {
  port.execute(
    'INSERT INTO mcp_occurrences (tenant, sub_key, seq, kind, event_id, received_at, row) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [cells.tenant, cells.subKey, seq, kind, eventId, at, JSON.stringify(row)],
  )
}

function trim(port: SqlPort, cells: SubscriptionCells, batch: Batch): number {
  const where = "tenant = ? AND sub_key = ? AND kind = 'event'"
  const old = port.execute(
    `SELECT COUNT(*) FROM mcp_occurrences WHERE ${where} AND received_at < ?`,
    [cells.tenant, cells.subKey, batch.floor],
  ).rows[0]
  port.execute(`DELETE FROM mcp_occurrences WHERE ${where} AND received_at < ?`, [
    cells.tenant,
    cells.subKey,
    batch.floor,
  ])
  const count = Number(
    port.execute(`SELECT COUNT(*) FROM mcp_occurrences WHERE ${where}`, [
      cells.tenant,
      cells.subKey,
    ]).rows[0]?.[0] ?? 0,
  )
  const over = Math.max(0, count - batch.maxEvents)
  if (over > 0)
    port.execute(
      `DELETE FROM mcp_occurrences WHERE tenant = ? AND sub_key = ? AND seq IN (SELECT seq FROM mcp_occurrences WHERE ${where} ORDER BY seq LIMIT ?)`,
      [cells.tenant, cells.subKey, cells.tenant, cells.subKey, over],
    )
  return Number(old?.[0] ?? 0) + over
}

/** One commit: the gap the peer reported, each event not yet kept, the position after them, and what the bounds drop. */
export function receiveBatch(
  port: SqlPort,
  cells: SubscriptionCells,
  batch: Batch,
): number | 'absent' {
  if (loadSubscription(port, cells) === null) return 'absent'
  let seq = next(port, cells)
  if (batch.gap !== null) insert(port, cells, seq++, 'gap', null, batch.at, { reason: batch.gap })
  let stored = 0
  for (const event of batch.events) {
    const kept = port.execute(
      "SELECT 1 FROM mcp_occurrences WHERE tenant = ? AND sub_key = ? AND kind = 'event' AND event_id = ? LIMIT 1",
      [cells.tenant, cells.subKey, event.eventId],
    ).rows[0]
    if (kept !== undefined) continue
    insert(port, cells, seq++, 'event', event.eventId, batch.at, event.row)
    stored += 1
  }
  if (trim(port, cells, batch) > 0)
    insert(port, cells, seq, 'gap', null, batch.at, { reason: 'trimmed' })
  if (batch.cursor !== null)
    port.execute('UPDATE mcp_subscriptions SET cursor = ? WHERE tenant = ? AND sub_key = ?', [
      batch.cursor,
      cells.tenant,
      cells.subKey,
    ])
  return stored
}

/** One commit: the row turns terminated with its reason a revision on, and the sequence ends with that. */
export function endSubscription(
  port: SqlPort,
  cells: SubscriptionCells,
  reason: string,
  at: string,
): 'ended' | 'absent' {
  const stored = loadSubscription(port, cells)
  if (stored === null) return 'absent'
  insert(port, cells, next(port, cells), 'ended', null, at, { reason })
  const row = { ...(stored.row as object), state: 'terminated', reason }
  port.execute(
    'UPDATE mcp_subscriptions SET revision = ?, row = ? WHERE tenant = ? AND sub_key = ?',
    [stored.revision + 1, JSON.stringify(row), cells.tenant, cells.subKey],
  )
  return 'ended'
}

export function acknowledgeThrough(port: SqlPort, cells: SubscriptionCells, seq: number): void {
  port.execute(
    'UPDATE mcp_subscriptions SET delivered = MAX(delivered, ?) WHERE tenant = ? AND sub_key = ?',
    [seq, cells.tenant, cells.subKey],
  )
}

export function readOccurrences(
  port: SqlPort,
  cells: SubscriptionCells,
  after: number,
  limit: number,
) {
  return port
    .execute(
      `SELECT seq, kind, received_at, row FROM mcp_occurrences WHERE tenant = ? AND sub_key = ? AND seq > ? ORDER BY seq LIMIT ${String(Math.min(limit, LISTED))}`,
      [cells.tenant, cells.subKey, after],
    )
    .rows.map(row => ({
      seq: Number(row[0]),
      kind: String(row[1]),
      receivedAt: String(row[2]),
      row: JSON.parse(String(row[3])) as unknown,
    }))
}
