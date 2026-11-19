// The after-the-fact cost question of one dispatch, asked through the send resources with the
// credential layer the dispatch was sent with. It reads; it never sends anything again.
import type { CallAccess, DispatchId } from '@omne-harness/model-contract'
import { MODEL_SEND, type CostLookupAnswer } from '@omne-harness/model-contract/provider'
import type { ModelSendBoundaryOptions } from './types.ts'

const unavailable = (diagnostic: string): CostLookupAnswer => ({ kind: 'unavailable', diagnostic })

export function createCostLookup<P>(options: ModelSendBoundaryOptions<P>) {
  return async (
    input: CallAccess<P> & Readonly<{ dispatch: DispatchId }>,
    signal: AbortSignal,
  ): Promise<CostLookupAnswer> => {
    const lookup = options.resources.lookupCost?.bind(options.resources)
    if (lookup === undefined) return { kind: 'unsupported' }
    const records = await options.commands.dispatches(input)
    if ('failure' in records) return unavailable(`records-${records.failure.kind}`)
    const record = records.ok.find(item => item.dispatch === input.dispatch)
    if (record?.request === undefined) return { kind: 'unsupported' }
    const secrets = options.credentials.resolve({
      provider: record.supplier.provider,
      layer: record.supplier.credential,
      purpose: MODEL_SEND,
      access: { principal: input.principal, tenant: input.tenant },
    })
    if (!('ok' in secrets)) return unavailable(`credential-${secrets.failure.kind}`)
    try {
      return await lookup(
        { supplier: record.supplier, request: record.request, secrets: secrets.ok },
        signal,
      )
    } catch {
      return unavailable('lookup-threw')
    }
  }
}
