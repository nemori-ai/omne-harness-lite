import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import type { DomainRef } from '@omne-harness/sql-contract'
import { canonical, json, withinBudget } from './encoding.ts'
import { boundHolding, foreign, readAsset, readDomain } from './records.ts'
import { LIST_HANDLER, listRequestSchema, PROTOCOL, type Holding } from './schema.ts'

type Port = Parameters<ReadHandlerModule['read']>[1]
type Result = ReturnType<ReadHandlerModule['read']>
type Lookup = ReturnType<typeof listRequestSchema.parse>['lookup']

const FORBIDDEN: Result = { kind: 'read', output: { kind: 'rejected', reason: 'forbidden' } }

function heldRows(port: Port, domain: DomainRef, lookup: Lookup): Holding[] {
  const prefix = `[${canonical(lookup.category)},`
  const after = lookup.after === null ? prefix : canonical([lookup.category, lookup.after])
  return port
    .execute(
      "SELECT record FROM al_holdings WHERE scope_key = ? AND state = 'held' AND capability_key > ? AND capability_key < ? ORDER BY capability_key LIMIT ?",
      [canonical(domain), after, `${prefix.slice(0, -1)}-`, lookup.limit + 1],
    )
    .rows.map(row => boundHolding(row[0], domain))
}

function listedVersion(port: Port, holding: Holding): string | undefined {
  return holding.selection.kind === 'pinned'
    ? holding.selection.version
    : readAsset(port, holding.domain, holding.assetRef)?.latestVersion
}

export default {
  handler: LIST_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    if (!withinBudget(input)) return { kind: 'failed', diagnostic: 'assets_input_budget' }
    const parsed = listRequestSchema.safeParse(input)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'assets_invalid_input' }
    const { domain, lookup } = parsed.data
    const current = readDomain(port)
    if (foreign(current, domain)) return FORBIDDEN
    return pageOf(port, current === null ? [] : heldRows(port, domain, lookup), lookup.limit)
  },
} satisfies ReadHandlerModule

function pageOf(port: Port, rows: readonly Holding[], limit: number): Result {
  const items = []
  for (const holding of rows.slice(0, limit)) {
    const version = listedVersion(port, holding)
    if (version === undefined) return { kind: 'failed', diagnostic: 'assets_missing_version' }
    items.push({
      category: holding.category,
      name: holding.name,
      assetRef: holding.assetRef,
      version,
      selection: holding.selection.kind,
      enabled: holding.enabled,
    })
  }
  const next = rows.length > limit ? (items.at(-1)?.name ?? null) : null
  return { kind: 'read', output: json({ kind: 'page', items, next }) }
}
