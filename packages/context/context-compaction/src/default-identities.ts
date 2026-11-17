import { encodeCompactionTaskRef, type CompactionRequest } from '@omne-harness/agent-contract'
import {
  decodeModelCallId,
  decodeModelOperationId,
  encodeModelInvocationRef,
  type ConsumerRef,
} from '@omne-harness/model-contract'
import { digest } from './evidence.ts'
import type { ProcessedSummary } from './default-state.ts'

export const DEFAULT_COMPACTION_CONSUMER = '@omne-harness/context-compaction'
const value = <T>(result: { ok: T } | { failure: unknown }): T => {
  if ('failure' in result) throw new TypeError('invalid derived summary identity')
  return result.ok
}
export function summaryIdentities(request: CompactionRequest, attempt: number) {
  const key = digest([request.ref, attempt]).slice('sha256:'.length)
  const call = value(decodeModelCallId(`mcall_compaction_${key}`))
  const operation = (stage: string) =>
    value(decodeModelOperationId(`mop_compaction_${key}_${stage}`))
  const consumer: ConsumerRef = {
    owner: DEFAULT_COMPACTION_CONSUMER,
    work: value(encodeCompactionTaskRef(request.ref)),
    position: String(attempt),
    purpose: 'summary',
  }
  const reference = value(
    encodeModelInvocationRef({ tenant: request.ref.tenant, call, admission: operation('admit') }),
  )
  return { call, operation, reference, consumer }
}
export function summaryCompletion(request: CompactionRequest, result: ProcessedSummary) {
  const { acknowledged: _acknowledged, ...processed } = result
  return {
    owner: DEFAULT_COMPACTION_CONSUMER,
    record: summaryIdentities(request, result.attempt).call,
    revision: '1',
    digest: digest({ ref: request.ref, processed }),
  }
}
