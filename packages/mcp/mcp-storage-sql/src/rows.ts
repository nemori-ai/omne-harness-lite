import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import type { CatalogRowKey, TaskRowCells } from './schema.ts'

/** One statement at a time, inside the transaction of a commit or of a read; a read refuses a statement with no LIMIT. */
export type SqlPort = Readonly<{ execute(sql: string, params: readonly SqlValue[]): QueryRows }>

export type CatalogRow = Readonly<{ revision: number; record: unknown }>

const where = 'tenant = ? AND account = ? AND holding = ? AND kind = ?'
const keyCells = (key: CatalogRowKey): SqlValue[] => [
  key.tenant,
  key.account,
  key.holding,
  key.kind,
]

export function loadCatalog(port: SqlPort, key: CatalogRowKey): CatalogRow | null {
  const found = port.execute(
    `SELECT revision, record FROM mcp_catalogs WHERE ${where} LIMIT 1`,
    keyCells(key),
  ).rows[0]
  return found === undefined
    ? null
    : { revision: Number(found[0]), record: JSON.parse(String(found[1])) as unknown }
}

export function saveCatalog(
  port: SqlPort,
  key: CatalogRowKey,
  revision: number,
  record: unknown,
): void {
  port.execute(
    'INSERT INTO mcp_catalogs (tenant, account, holding, kind, revision, record) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tenant, account, holding, kind) DO UPDATE SET revision = excluded.revision, record = excluded.record',
    [...keyCells(key), revision, JSON.stringify(record)],
  )
}

/** Marks a checkpoint of a tenant once; the answer says whether this commit made the mark. */
export function markOnce(port: SqlPort, tenant: string, checkpoint: string): 'marked' | 'already' {
  const found = port.execute(
    'SELECT 1 FROM mcp_continuations WHERE tenant = ? AND checkpoint = ? LIMIT 1',
    [tenant, checkpoint],
  ).rows[0]
  if (found !== undefined) return 'already'
  port.execute('INSERT INTO mcp_continuations (tenant, checkpoint) VALUES (?, ?)', [
    tenant,
    checkpoint,
  ])
  return 'marked'
}

type Step = Readonly<{ state: string; round: number; arrival?: unknown }>
const taskWhere = 'tenant = ? AND principal = ? AND holding = ? AND task = ?'
const taskCells = (key: TaskRowCells): SqlValue[] => [
  key.tenant,
  key.principal,
  key.holding,
  key.task,
]

/** The rows of one task key: none, the one, or two when the task is ambiguous. */
export function loadTask(port: SqlPort, key: TaskRowCells): readonly Record<string, unknown>[] {
  return port
    .execute(`SELECT row FROM mcp_tasks WHERE ${taskWhere} LIMIT 2`, taskCells(key))
    .rows.map(found => JSON.parse(String(found[0])) as Record<string, unknown>)
}

export function insertTask(
  port: SqlPort,
  key: TaskRowCells,
  account: string,
  row: Readonly<Record<string, unknown>> & Step,
): void {
  port.execute(
    'INSERT INTO mcp_tasks (tenant, principal, holding, task, account, state, round, row) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tenant, principal, holding, task, account) DO UPDATE SET state = excluded.state, round = excluded.round, row = excluded.row',
    [...taskCells(key), account, row.state, row.round, JSON.stringify(row)],
  )
}

/** Moves the one row of a key from a step to the next; an ambiguous or absent key, or another step, is stale. */
export function stepTask(
  port: SqlPort,
  key: TaskRowCells,
  from: Step,
  to: Step,
): 'moved' | 'stale' {
  const rows = loadTask(port, key)
  const row = rows[0]
  if (rows.length !== 1 || row === undefined) return 'stale'
  if (row['state'] !== from.state || row['round'] !== from.round) return 'stale'
  const { arrival: _arrival, ...rest } = row
  const next = { ...rest, ...to }
  port.execute(`UPDATE mcp_tasks SET state = ?, round = ?, row = ? WHERE ${taskWhere}`, [
    to.state,
    to.round,
    JSON.stringify(next),
    ...taskCells(key),
  ])
  return 'moved'
}

const LISTED = 1000

/** The followed rows of a tenant whose key is not ambiguous, with their keys. */
export function listFollowing(port: SqlPort, tenant: string): readonly unknown[] {
  return port
    .execute(
      `SELECT principal, holding, task, row FROM mcp_tasks AS t WHERE tenant = ? AND state = 'following' AND (SELECT COUNT(*) FROM mcp_tasks AS o WHERE o.tenant = t.tenant AND o.principal = t.principal AND o.holding = t.holding AND o.task = t.task) = 1 ORDER BY principal, holding, task LIMIT ${String(LISTED)}`,
      [tenant],
    )
    .rows.map(found => ({
      principal: String(found[0]),
      holding: String(found[1]),
      task: String(found[2]),
      row: JSON.parse(String(found[3])) as unknown,
    }))
}
