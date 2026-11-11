import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import {
  belongs,
  readAsset,
  readDomain,
  readHolding,
  readVersion,
  selectedVersion,
} from './records.ts'
import { HANDLER, PROTOCOL, readRequestSchema } from './schema.ts'
import { equal, json, scopeRef, withinBudget } from './encoding.ts'
function holdingResult(
  request: Extract<ReturnType<typeof readRequestSchema.parse>, { kind: 'holding' }>,
  port: Parameters<ReadHandlerModule['read']>[1],
): ReturnType<ReadHandlerModule['read']> {
  const { lookup, domain } = request
  if (lookup.scopeRef !== scopeRef(domain))
    return { kind: 'read', output: { kind: 'rejected', reason: 'forbidden' } }
  const holding = readHolding(port, domain, lookup.holdingRef)
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
  request: Extract<ReturnType<typeof readRequestSchema.parse>, { kind: 'asset' }>,
  port: Parameters<ReadHandlerModule['read']>[1],
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
