import { judgeModelResponse, judgePendingModelResponse } from '@omne-harness-lite/model-response'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import {
  createSettlementCoordinator,
  type SettlementContention,
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
    await coordinator.close()
  }
}
