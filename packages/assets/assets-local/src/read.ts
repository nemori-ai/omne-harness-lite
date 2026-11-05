import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { belongs, readHolding, readVersion, selectedVersion } from './records.ts'
import { HANDLER, PROTOCOL, readRequestSchema } from './schema.ts'
import { json, scopeRef, withinBudget } from './encoding.ts'
export default {
  handler: HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    if (!withinBudget(input)) return { kind: 'failed', diagnostic: 'assets_input_budget' }
    const request = readRequestSchema.safeParse(input)
    if (!request.success) return { kind: 'failed', diagnostic: 'assets_invalid_input' }
    const { domain } = request.data
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
    const { lookup } = request.data
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
  },
} satisfies ReadHandlerModule
