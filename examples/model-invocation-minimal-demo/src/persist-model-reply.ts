import { judgeModelResponse, judgePendingModelResponse } from '@omne-harness-lite/model-response'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import {
  createSettlementCoordinator,
  type SettlementContention,
  type SettlementCoordinator,
  type SettlementDiagnostic,
  type SettlementLogBinding,
  type SettlementOwner,
  type SettlementResult,
  type SettlementScheduler,
  type RunHistoryReader,
} from '@omne-harness-lite/model-request-runtime'

/** The demo is the actual message writer for a handed-off reply (RT8 S-17/S-49). */
export async function persistDemoModelReply(input: {
  readonly pending: PendingModelResponse
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  readonly contention: SettlementContention
  readonly scheduler: SettlementScheduler
  readonly run?: RunHistoryReader
  readonly diagnostic: (event: SettlementDiagnostic) => void
  /**
   * The coordinator keeps ownership of an original write whose outcome is still unknown and its
   * close then refuses. The host retains that coordinator and closes it again later, never
   * dropping it.
   */
  readonly retain: (coordinator: Pick<SettlementCoordinator, 'close'>) => void
}): Promise<SettlementResult> {
  if ('rejected' in judgePendingModelResponse(input.pending))
    return { unavailable: true, reason: 'candidate' }
  // The coordinator reads the original owned prefix and interprets the Run
  // before deciding the response's late fact and the complete M/R batch.
  const response = { ...input.pending, replyDisposition: 'persisted' as const }
  const judged = judgeModelResponse(response)
  if (!('ok' in judged)) return { unavailable: true, reason: 'candidate' }
  const coordinator = createSettlementCoordinator({
    binding: input.binding,
    owner: input.owner,
    settlementContention: input.contention,
    settlementScheduler: input.scheduler,
    ...(input.run === undefined ? {} : { run: input.run }),
    diagnostic: input.diagnostic,
  })
  try {
    const handle = coordinator.settle({
      target: {
        call: response.call.callId,
        dispatch: response.dispatch,
        response: response.id,
      },
      current: { messageId: response.reply.id, disposition: 'persisted' },
      response,
    })
    const result = await handle.completion
    await handle.stopped
    return result
  } finally {
    try {
      await coordinator.close()
    } catch {
      // The settlement result above already says what became known; the coordinator still owns
      // the unresolved original and must stay reachable for another close.
      input.retain(coordinator)
    }
  }
}
