import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import type { DomainRef } from '@omne-harness/sql-contract'
import { canonical, json, withinBudget } from './encoding.ts'
import { originOf } from './origin.ts'
import { z } from 'zod'
import { boundHolding, foreign, readAsset, readDomain, readSummary } from './records.ts'
import {
  heldRequestSchema,
  LIST_HANDLER,
  listRequestSchema,
  PROTOCOL,
  versionsRequestSchema,
  type Holding,
} from './schema.ts'

type Port = Parameters<ReadHandlerModule['read']>[1]
type Result = ReturnType<ReadHandlerModule['read']>
type Lookup = ReturnType<typeof listRequestSchema.parse>['lookup']
type VersionsLookup = ReturnType<typeof versionsRequestSchema.parse>['lookup']

const requestSchema = z.discriminatedUnion('kind', [
  listRequestSchema,
  versionsRequestSchema,
  heldRequestSchema,
])
const versionKeySchema = z.tuple([z.unknown(), z.string(), z.string()])

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

type HeldLookup = ReturnType<typeof heldRequestSchema.parse>['lookup']

/** One page of everything the domain holds, of every category: what a held definition is to an evaluation. */
function heldOf(port: Port, domain: DomainRef, lookup: HeldLookup): Result {
  const rows = port
    .execute(
      "SELECT record FROM al_holdings WHERE scope_key = ? AND state = 'held' AND capability_key > ? ORDER BY capability_key LIMIT ?",
      [canonical(domain), lookup.after ?? '', lookup.limit + 1],
    )
    .rows.map(row => boundHolding(row[0], domain))
  const items = []
  for (const holding of rows.slice(0, lookup.limit)) {
    const version = listedVersion(port, holding)
    if (version === undefined) return { kind: 'failed', diagnostic: 'assets_missing_version' }
    const { category, name, assetRef, enabled } = holding
    items.push({ category, name, assetRef, version, enabled })
  }
  const last = items.at(-1)
  const next = rows.length > lookup.limit && last ? canonical([last.category, last.name]) : null
  return { kind: 'read', output: json({ kind: 'held', items, next }) }
}

function versionsOf(port: Port, domain: DomainRef, lookup: VersionsLookup): Result {
  const prefix = `${canonical([domain, lookup.assetRef]).slice(0, -1)},`
  const after = lookup.after === null ? prefix : canonical([domain, lookup.assetRef, lookup.after])
  const versions = port
    .execute(
      'SELECT version_key FROM al_versions WHERE version_key > ? AND version_key < ? ORDER BY version_key LIMIT ?',
      [after, `${prefix.slice(0, -1)}-`, lookup.limit + 1],
    )
    .rows.map(row => {
      const [, assetRef, version] = versionKeySchema.parse(JSON.parse(String(row[0])))
      if (assetRef !== lookup.assetRef) throw new TypeError('Misbound version key')
      return version
    })
  const page = versions.slice(0, lookup.limit)
  const next = versions.length > lookup.limit ? (page.at(-1) ?? null) : null
  return { kind: 'read', output: json({ kind: 'page', versions: page, next }) }
}

export default {
  handler: LIST_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    if (!withinBudget(input)) return { kind: 'failed', diagnostic: 'assets_input_budget' }
    const parsed = requestSchema.safeParse(input)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'assets_invalid_input' }
    const { domain } = parsed.data
    const current = readDomain(port)
    if (foreign(current, domain)) return FORBIDDEN
    if (parsed.data.kind === 'versions') return versionsOf(port, domain, parsed.data.lookup)
    if (parsed.data.kind === 'held') return heldOf(port, domain, parsed.data.lookup)
    const { lookup } = parsed.data
    return pageOf(port, heldRows(port, domain, lookup), lookup.limit)
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
      holdingRef: holding.holdingRef,
      selection: holding.selection.kind,
      enabled: holding.enabled,
      origin: originOf(holding),
      summary: readSummary(port, holding.domain, holding.assetRef, version),
    })
  }
  const next = rows.length > limit ? (items.at(-1)?.name ?? null) : null
  return { kind: 'read', output: json({ kind: 'page', items, next }) }
}
