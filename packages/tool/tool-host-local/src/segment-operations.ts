import type { Outcome } from '@omne-harness/operation-result'
import type {
  ToolIdentityRejection,
  ToolOperationId,
  ToolWaitId,
} from '@omne-harness/tool-contract'
import { decodeToolWaitId } from '@omne-harness/tool-contract/provider'

export function segmentWait(
  start: ToolOperationId,
): Outcome<ToolWaitId, ToolIdentityRejection<'ToolWaitId'>> {
  return decodeToolWaitId(`${start}/wait`)
}
