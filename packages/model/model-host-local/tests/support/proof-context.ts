// What the commands give a materialization evidence adapter of one send demand: the head of the
// request and the digest of the whole request, in place of the request itself.
import { requestHead, type SendDemand } from '@omne-harness/model-contract/provider'
import { modelRequestDigest } from '@omne-harness/model/commands'

export function proofContext<P>(demand: SendDemand<P>) {
  const { request, ...rest } = demand
  return { ...rest, request: requestHead(request), requestDigest: modelRequestDigest(request) }
}
