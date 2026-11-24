// The evidence a late fact of a dispatch must bring: its source, as the call's evidence adapter
// judges it, with the upstream's request id of the dispatch to compare against.
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { encodedBytes, MAX_TERMINATION_BYTES } from './judge.ts'
import type { ModelCommandCore } from './state.ts'
import type { CallDocument, DispatchDocument } from './types.ts'
import { checkedEvidence, invalid } from './value.ts'

export function lateFactProof<P>(
  core: ModelCommandCore<P>,
  call: CallDocument,
  dispatch: DispatchDocument,
  input: Parameters<ModelCommands<P>['recordLateFact']>[0],
) {
  if (input.fact.kind === 'terminal' && encodedBytes(input.fact.actual) > MAX_TERMINATION_BYTES)
    return { failure: invalid('termination', 'encoded-byte-limit') }
  const adapter = core.adapter(call)
  if ('kind' in adapter) return { failure: adapter }
  return checkedEvidence(
    adapter.lateFact({
      tenant: input.tenant,
      call: input.call,
      consumer: structuredClone(call.state.consumer),
      execution: call.execution,
      dispatch: input.dispatch,
      supplier: structuredClone(dispatch.record.supplier),
      upstreamRequest: dispatch.record.request ?? null,
      source: structuredClone(input.source),
      fact: structuredClone(input.fact),
    }),
  )
}
