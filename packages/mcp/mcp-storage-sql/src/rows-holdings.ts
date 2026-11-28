import type { SqlPort } from './rows.ts'

type GrantOf = Readonly<{ holding: string; endpoint: string }>

/** A read lists at most this many rows of a table; what is past it is listed once the ones before it are gone. */
const LISTED = 1000

function grantOf(grantKey: string): GrantOf | undefined {
  const parsed: unknown = JSON.parse(grantKey)
  if (!Array.isArray(parsed) || parsed.length !== 2) return undefined
  const [holding, endpoint] = parsed as unknown[]
  return typeof holding === 'string' && typeof endpoint === 'string'
    ? { holding, endpoint }
    : undefined
}

type GrantTable = 'mcp_grants' | 'mcp_pending'

const grantKeys = (port: SqlPort, table: GrantTable, tenant: string, bound = '') =>
  port
    .execute(`SELECT grant_key FROM ${table} WHERE tenant = ? ORDER BY grant_key${bound}`, [tenant])
    .rows.map(row => String(row[0]))
const listed = ` LIMIT ${String(LISTED)}`

function heldBy(subKey: string): string | undefined {
  const parsed: unknown = JSON.parse(subKey)
  return Array.isArray(parsed) && typeof parsed[0] === 'string' ? parsed[0] : undefined
}

const subscriptionKeys = (port: SqlPort, tenant: string, bound = '') =>
  port
    .execute(`SELECT sub_key FROM mcp_subscriptions WHERE tenant = ? ORDER BY sub_key${bound}`, [
      tenant,
    ])
    .rows.map(row => String(row[0]))

export function keptHoldings(
  port: SqlPort,
  tenant: string,
): readonly Readonly<{ holding: string; grants: readonly string[] }>[] {
  const kept = new Map<string, Set<string>>()
  const of = (holding: string) => kept.get(holding) ?? kept.set(holding, new Set()).get(holding)!
  for (const table of ['mcp_catalogs', 'mcp_tasks'])
    for (const row of port.execute(
      `SELECT DISTINCT holding FROM ${table} WHERE tenant = ? ORDER BY holding${listed}`,
      [tenant],
    ).rows)
      of(String(row[0]))
  for (const key of grantKeys(port, 'mcp_pending', tenant, listed)) {
    const grant = grantOf(key)
    if (grant !== undefined) of(grant.holding)
  }
  for (const key of subscriptionKeys(port, tenant, listed)) {
    const held = heldBy(key)
    if (held !== undefined) of(held)
  }
  for (const key of grantKeys(port, 'mcp_grants', tenant, listed)) {
    const grant = grantOf(key)
    if (grant !== undefined) of(grant.holding).add(grant.endpoint)
  }
  return [...kept.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([holding, grants]) => ({ holding, grants: [...grants].sort() }))
}

export function forgetHolding(port: SqlPort, tenant: string, holding: string): void {
  port.execute('DELETE FROM mcp_catalogs WHERE tenant = ? AND holding = ?', [tenant, holding])
  port.execute('DELETE FROM mcp_tasks WHERE tenant = ? AND holding = ?', [tenant, holding])
  for (const table of ['mcp_grants', 'mcp_pending'] as const)
    for (const key of grantKeys(port, table, tenant))
      if (grantOf(key)?.holding === holding)
        port.execute(`DELETE FROM ${table} WHERE tenant = ? AND grant_key = ?`, [tenant, key])
  for (const key of subscriptionKeys(port, tenant))
    if (heldBy(key) === holding)
      for (const table of ['mcp_subscriptions', 'mcp_occurrences'])
        port.execute(`DELETE FROM ${table} WHERE tenant = ? AND sub_key = ?`, [tenant, key])
}
