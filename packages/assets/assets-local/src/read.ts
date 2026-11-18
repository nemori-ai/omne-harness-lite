import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import {
  belongs,
  foreign,
  readAsset,
  readDomain,
  readHolding,
  readSummary,
  readVersion,
  selectedVersion,
} from './records.ts'
import { HANDLER, PROTOCOL, readRequestSchema } from './schema.ts'
import { canonical, json, scopeRef, withinBudget } from './encoding.ts'
const FORBIDDEN = { kind: 'read', output: { kind: 'rejected', reason: 'forbidden' } } as const

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
function heldCapabilityResult(
  request: Extract<ReadRequest, { kind: 'heldCapability' }>,
  port: Port,
): ReturnType<ReadHandlerModule['read']> {
  const { lookup, domain } = request
  const current = readDomain(port)
  if (foreign(current, domain)) return FORBIDDEN
  if (current === null) return { kind: 'read', output: { kind: 'absent' } }
  const row = port.execute(
    "SELECT holding_ref FROM al_holdings WHERE scope_key = ? AND capability_key = ? AND state = 'held' LIMIT 1",
    [canonical(domain), canonical([lookup.category, lookup.name])],
  ).rows[0]
  if (!row || typeof row[0] !== 'string') return { kind: 'read', output: { kind: 'absent' } }
  return heldResult(readHolding(port, domain, row[0]), port)
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
  if (foreign(current, domain)) return FORBIDDEN
  const asset = readAsset(port, domain, request.lookup.assetRef)
  return { kind: 'read', output: json(asset ? { kind: 'asset', asset } : { kind: 'absent' }) }
}
function versionResult(
  request: Extract<ReadRequest, { kind: 'version' }>,
  port: Port,
): ReturnType<ReadHandlerModule['read']> {
  const { domain, lookup } = request
  const version = readVersion(port, domain, lookup.assetRef, lookup.version)
  return { kind: 'read', output: json(version ? { kind: 'version', version } : { kind: 'absent' }) }
}
function summaryResult(
  request: Extract<ReadRequest, { kind: 'summary' }>,
  port: Port,
): ReturnType<ReadHandlerModule['read']> {
  const { domain, lookup } = request
  const summary = readSummary(port, domain, lookup.assetRef, lookup.version)
  return { kind: 'read', output: json({ kind: 'summary', summary }) }
}

export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    if (!withinBudget(input)) return { kind: 'failed', diagnostic: 'assets_input_budget' }
    const parsed = readRequestSchema.safeParse(input)
    if (!parsed.success) return { kind: 'failed', diagnostic: 'assets_invalid_input' }
    const request = parsed.data
    switch (request.kind) {
      case 'asset':
        return assetResult(request, port)
      case 'heldCapability':
        return heldCapabilityResult(request, port)
      case 'version':
        return belongs(port, request.domain) ? versionResult(request, port) : FORBIDDEN
      case 'holding':
        return belongs(port, request.domain) ? holdingResult(request, port) : FORBIDDEN
      case 'summary':
        return belongs(port, request.domain) ? summaryResult(request, port) : FORBIDDEN
    }
  },
} satisfies ReadHandlerModule
