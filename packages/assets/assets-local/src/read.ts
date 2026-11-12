import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import {
  belongs,
  decode,
  readAsset,
  readDomain,
  readHolding,
  readVersion,
  selectedVersion,
} from './records.ts'
import { ASSET_LIST_LIMIT, assetSchema, HANDLER, PROTOCOL, readRequestSchema } from './schema.ts'
import { canonical, equal, json, scopeRef, withinBudget } from './encoding.ts'
type ReadRequest = ReturnType<typeof readRequestSchema.parse>
type Port = Parameters<ReadHandlerModule['read']>[1]

function holdingResult(
  request: Extract<ReadRequest, { kind: 'holding' }>,
  port: Port,
): ReturnType<ReadHandlerModule['read']> {
  const { lookup, domain } = request
  if (lookup.scopeRef !== scopeRef(domain))
    return { kind: 'read', output: { kind: 'rejected', reason: 'forbidden' } }
  return heldResult(readHolding(port, domain, lookup.holdingRef), port)
}
/** The held holding of one capability identity in this domain: at most one, by the unique index. */
function heldCapabilityResult(
  request: Extract<ReadRequest, { kind: 'heldCapability' }>,
  port: Port,
): ReturnType<ReadHandlerModule['read']> {
  const { lookup, domain } = request
  const row = port.execute(
    "SELECT holding_ref FROM al_holdings WHERE scope_key = ? AND capability_key = ? AND state = 'held' LIMIT 1",
    [canonical(domain), canonical([lookup.category, lookup.name])],
  ).rows[0]
  if (!row || typeof row[0] !== 'string') return { kind: 'read', output: { kind: 'absent' } }
  return heldResult(readHolding(port, domain, row[0]), port)
}
/** Every asset of the domain, by reference and identity, up to `ASSET_LIST_LIMIT`. */
function assetListResult(
  request: Extract<ReadRequest, { kind: 'assetList' }>,
  port: Port,
): ReturnType<ReadHandlerModule['read']> {
  const rows = port.execute('SELECT record FROM al_assets ORDER BY asset_key LIMIT ?', [
    ASSET_LIST_LIMIT + 1,
  ]).rows
  if (rows.length > ASSET_LIST_LIMIT) return { kind: 'failed', diagnostic: 'assets_list_limit' }
  const assets = rows
    .map(row => decode(assetSchema, row[0]))
    .filter(asset => equal(asset.domain, request.domain))
    .map(({ assetRef, category, name }) => ({ assetRef, category, name }))
  return { kind: 'read', output: json({ kind: 'assets', assets }) }
}
function heldResult(
  holding: ReturnType<typeof readHolding>,
  port: Port,
): ReturnType<ReadHandlerModule['read']> {
  if (!holding) return { kind: 'read', output: { kind: 'absent' } }
  const selected = holding.state === 'held' ? selectedVersion(port, holding) : null
  if (holding.state === 'held' && !selected)
    return { kind: 'failed', diagnostic: 'assets_missing_version' }
  const version = selected?.version
  return {
    kind: 'read',
    output: json({
      kind: 'holding',
      holding,
      selected: version
        ? {
            version: version.version,
            definitionRef:
              version.declaration.kind === 'declared' ? version.declaration.definitionRef : null,
            definition:
              version.declaration.kind === 'declared' ? version.declaration.definition : null,
            source: version.source,
            body: version.body,
            ownerRevision: selected?.ownerRevision,
          }
        : null,
    }),
  }
}
function assetResult(
  request: Extract<ReadRequest, { kind: 'asset' }>,
  port: Port,
): ReturnType<ReadHandlerModule['read']> {
  const { domain } = request
  const current = readDomain(port)
  if (scopeRef(domain) === null || (current !== null && !equal(current.domain, domain)))
    return { kind: 'read', output: { kind: 'rejected', reason: 'forbidden' } }
  const asset = readAsset(port, domain, request.lookup.assetRef)
  return { kind: 'read', output: json(asset ? { kind: 'asset', asset } : { kind: 'absent' }) }
}
export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    if (!withinBudget(input)) return { kind: 'failed', diagnostic: 'assets_input_budget' }
    const request = readRequestSchema.safeParse(input)
    if (!request.success) return { kind: 'failed', diagnostic: 'assets_invalid_input' }
    const { domain } = request.data
    if (request.data.kind === 'asset') return assetResult(request.data, port)
    if (request.data.kind === 'assetList' || request.data.kind === 'heldCapability') {
      // A domain without any record yet has no asset and no holding.
      const current = readDomain(port)
      if (scopeRef(domain) === null || (current !== null && !equal(current.domain, domain)))
        return { kind: 'read', output: { kind: 'rejected', reason: 'forbidden' } }
      if (current === null)
        return {
          kind: 'read',
          output:
            request.data.kind === 'assetList' ? { kind: 'assets', assets: [] } : { kind: 'absent' },
        }
      return request.data.kind === 'assetList'
        ? assetListResult(request.data, port)
        : heldCapabilityResult(request.data, port)
    }
    if (!belongs(port, domain))
      return { kind: 'read', output: { kind: 'rejected', reason: 'forbidden' } }
    if (request.data.kind === 'version') {
      const version = readVersion(
        port,
        domain,
        request.data.lookup.assetRef,
        request.data.lookup.version,
      )
      return {
        kind: 'read',
        output: json(version ? { kind: 'version', version } : { kind: 'absent' }),
      }
    }
    return holdingResult(request.data, port)
  },
} satisfies ReadHandlerModule
