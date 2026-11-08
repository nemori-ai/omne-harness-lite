import {
  encodeToolInvocationRef,
  type ToolInvocationParts,
  type ToolFailure,
} from '@omne-harness/tool-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { FIRST_RESULT_VERSION } from './evidence.ts'
import type { ResultReference } from './tools-protocol.ts'

export function firstResultReference(
  parts: ToolInvocationParts,
): Outcome<ResultReference, ToolFailure> {
  const reference = encodeToolInvocationRef(parts)
  return 'failure' in reference
    ? fail({ kind: 'invalid', field: 'result.reference', reason: reference.failure.reason })
    : succeed({ reference: reference.ok, result: FIRST_RESULT_VERSION })
}
