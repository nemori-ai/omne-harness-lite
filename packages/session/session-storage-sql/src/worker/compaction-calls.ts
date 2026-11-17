import { compactionCallChangeOf, type HistoryEntry } from '@omne-harness/session-contract'
import { big, oneRow, rowsOf, text, type Executor } from './support.ts'

type Scope = Readonly<{ tenant: string; session: string }>

export function indexCompactionCall(port: Executor, scope: Scope, row: HistoryEntry): void {
  const decoded = compactionCallChangeOf(row)
  if ('failure' in decoded) throw new Error(decoded.failure)
  const entry = decoded.ok
  if (entry === null) return
  const key = [scope.tenant, scope.session]
  if (entry.kind === 'bound') {
    const bound = entry.associated
    const previous = oneRow(
      port,
      'SELECT bound FROM sl_compaction_call WHERE tenant = ? AND session = ? AND consumption = ? LIMIT 1',
      [...key, entry.consumption],
    )
    if (previous === undefined) {
      port.execute(
        `INSERT INTO sl_compaction_call
        (tenant, session, consumption, registered, association, bound, results, pending, open)
        VALUES (?, ?, ?, ?, NULL, ?, 0, 0, ?)`,
        [...key, entry.consumption, row.id, bound ? 1n : 0n, bound ? 1n : 0n],
      )
    } else if (big(previous['bound']) === 0n && bound) {
      port.execute(
        `UPDATE sl_compaction_call SET association = ?, bound = 1, open = 1
        WHERE tenant = ? AND session = ? AND consumption = ?`,
        [row.id, ...key, entry.consumption],
      )
    }
    return
  }
  const original = [...key, entry.consumption]
  const call = oneRow(
    port,
    `SELECT bound, results, pending FROM sl_compaction_call
    WHERE tenant = ? AND session = ? AND consumption = ? LIMIT 1`,
    original,
  )
  if (call === undefined || big(call['bound']) !== 1n)
    throw new Error('the result has no associated call protection')
  const resultKey = [...original, entry.version]
  const previous = oneRow(
    port,
    `SELECT processed FROM sl_compaction_result
    WHERE tenant = ? AND session = ? AND consumption = ? AND version = ? LIMIT 1`,
    resultKey,
  )
  const processed = entry.processed
  const wasProcessed = previous !== undefined && big(previous['processed']) === 1n
  if (previous !== undefined && (!processed || wasProcessed)) return
  port.execute(
    `INSERT INTO sl_compaction_result (tenant, session, consumption, version, processed)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT (tenant, session, consumption, version)
    DO UPDATE SET processed = excluded.processed`,
    [...resultKey, processed ? 1n : 0n],
  )
  const results = big(call['results']) + (previous === undefined ? 1n : 0n)
  const pending = big(call['pending']) + (previous === undefined ? (processed ? 0n : 1n) : -1n)
  port.execute(
    `UPDATE sl_compaction_call SET results = ?, pending = ?, open = ?
    WHERE tenant = ? AND session = ? AND consumption = ?`,
    [results, pending, pending > 0n ? 1n : 0n, ...original],
  )
}

export function openCompactionCalls(port: Executor, scope: Scope): readonly string[] {
  const rows = rowsOf(
    port,
    `SELECT registered, association FROM sl_compaction_call INDEXED BY sl_compaction_open_call_idx
    WHERE tenant = ? AND session = ? AND open = 1 ORDER BY consumption LIMIT 100001`,
    [scope.tenant, scope.session],
  )
  if (rows.length > 100000) throw new Error('the current call protection exceeds the read bound')
  return rows.flatMap(row =>
    row['association'] === null
      ? [text(row['registered'])]
      : [text(row['registered']), text(row['association'])],
  )
}
