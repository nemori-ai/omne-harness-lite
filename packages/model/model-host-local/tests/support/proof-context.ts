import { requestHead, type SendDemand } from '@omne-harness/model-contract/provider'
import { modelRequestDigest } from '@omne-harness/model/commands'

export function proofContext<P>(demand: SendDemand<P>) {
  const { request, ...rest } = demand
  return { ...rest, request: requestHead(request), requestDigest: modelRequestDigest(request) }
}
