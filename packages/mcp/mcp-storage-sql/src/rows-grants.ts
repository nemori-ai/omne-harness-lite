import type { SqlPort } from './rows.ts'

/** A grant, a pending authorization and a client registration live in their tenant's domain; the key is the holding and the endpoint. */
export type GrantCells = Readonly<{ tenant: string; grantKey: string }>

export function putPending(port: SqlPort, cells: GrantCells, state: string, row: unknown): void {
  port.execute('DELETE FROM mcp_pending WHERE tenant = ? AND grant_key = ?', [
    cells.tenant,
    cells.grantKey,
  ])
  port.execute('INSERT INTO mcp_pending (tenant, state, grant_key, row) VALUES (?, ?, ?, ?)', [
    cells.tenant,
    state,
    cells.grantKey,
    JSON.stringify(row),
  ])
}

/** The row of a state value, deleted in the same commit: a state value is taken once. */
export function takePending(
  port: SqlPort,
  tenant: string,
  state: string,
): Readonly<{ grantKey: string; row: unknown }> | 'absent' {
  const found = port.execute(
    'SELECT grant_key, row FROM mcp_pending WHERE tenant = ? AND state = ? LIMIT 1',
    [tenant, state],
  ).rows[0]
  if (found === undefined) return 'absent'
  port.execute('DELETE FROM mcp_pending WHERE tenant = ? AND state = ?', [tenant, state])
  return { grantKey: String(found[0]), row: JSON.parse(String(found[1])) as unknown }
}

export function voidPending(port: SqlPort, cells: GrantCells): void {
  port.execute('DELETE FROM mcp_pending WHERE tenant = ? AND grant_key = ?', [
    cells.tenant,
    cells.grantKey,
  ])
}

export function loadGrant(
  port: SqlPort,
  cells: GrantCells,
): Readonly<{ revision: number; row: unknown }> | null {
  const found = port.execute(
    'SELECT revision, row FROM mcp_grants WHERE tenant = ? AND grant_key = ? LIMIT 1',
    [cells.tenant, cells.grantKey],
  ).rows[0]
  return found === undefined
    ? null
    : { revision: Number(found[0]), row: JSON.parse(String(found[1])) as unknown }
}

export function saveGrant(port: SqlPort, cells: GrantCells, revision: number, row: unknown): void {
  port.execute(
    'INSERT INTO mcp_grants (tenant, grant_key, revision, row) VALUES (?, ?, ?, ?) ON CONFLICT(tenant, grant_key) DO UPDATE SET revision = excluded.revision, row = excluded.row',
    [cells.tenant, cells.grantKey, revision, JSON.stringify(row)],
  )
}

export function dropGrant(port: SqlPort, cells: GrantCells): void {
  port.execute('DELETE FROM mcp_grants WHERE tenant = ? AND grant_key = ?', [
    cells.tenant,
    cells.grantKey,
  ])
}

export function loadClient(port: SqlPort, tenant: string, issuer: string): unknown {
  const found = port.execute(
    'SELECT row FROM mcp_clients WHERE tenant = ? AND issuer = ? LIMIT 1',
    [tenant, issuer],
  ).rows[0]
  return found === undefined ? 'absent' : (JSON.parse(String(found[0])) as unknown)
}

export function saveClient(port: SqlPort, tenant: string, issuer: string, row: unknown): void {
  port.execute(
    'INSERT INTO mcp_clients (tenant, issuer, row) VALUES (?, ?, ?) ON CONFLICT(tenant, issuer) DO UPDATE SET row = excluded.row',
    [tenant, issuer, JSON.stringify(row)],
  )
}
