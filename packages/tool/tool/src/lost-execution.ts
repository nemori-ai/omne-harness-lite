import type { ContentBlock } from '@omne-harness/content-block'
import { fail } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type DurableEvidence,
  type Reply,
  type ToolStartRecord,
  type ToolState,
} from '@omne-harness/tool-contract'
import type { CallAccess, ToolCommands } from '@omne-harness/tool-contract/provider'

export function settleLostExecution<P, B extends ContentBlock>(
  commands: Pick<ToolCommands<P, B>, 'settleLost'>,
  access: CallAccess<P>,
  start: ToolStartRecord,
  continuity: DurableEvidence,
): Reply<ToolState> {
  const operation = decodeToolOperationId(`${start.operation}/lost`)
  if ('failure' in operation)
    return Promise.resolve(
      fail({ kind: 'invalid', field: 'operation', reason: operation.failure.reason }),
    )
  const { principal, tenant, call } = access
  return commands.settleLost({ principal, tenant, call, operation: operation.ok, continuity })
}
