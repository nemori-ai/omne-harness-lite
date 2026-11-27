import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import type { CatalogRowKey } from './schema.ts'

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
