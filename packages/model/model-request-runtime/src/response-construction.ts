import {
  judgeMessage,
  type AssistantMessage,
  type MessageId,
  type ModelCallDispatchedRecord,
} from '@omne-harness-lite/messages'
import {
  judgeModelResponse,
  type ModelResponse,
  type ReplyDisposition,
} from '@omne-harness-lite/model-response/v5'
import { compareRfc3339Instants } from '@omne-harness-lite/offer-expiry'
import { captureModelLogValue } from './log-codec-v2.ts'
import type { ModelInvocationResult } from './types.ts'
import type { ResponseConstructionResult } from './anchored-invocation-types.ts'

export interface ResponseConstructionInput {
  readonly dispatched: ModelCallDispatchedRecord
  readonly result: ModelInvocationResult
  readonly messageId: MessageId
  /** Actual confirmed original opened timestamp; null means definitively unopened. */
  readonly firstTokenAt: string | null
}
function response(value: unknown): value is ModelResponse {
  return 'ok' in judgeModelResponse(value)
}
function ordered(a: string, b: string): boolean {
  const order = compareRfc3339Instants(a, b)
  return 'ok' in order && order.ok <= 0
}
/** This noRun slice treats interruption as S-36 system stop: delivered content, no reply. */
export function constructAssistantReply(input: ResponseConstructionInput): AssistantMessage | null {
  if (
    input.result.ending === undefined ||
    input.firstTokenAt === null ||
    input.result.outcome === 'interrupted'
  )
    return null
  const judged = judgeMessage({
    id: input.messageId,
    type: 'assistant',
    response: input.dispatched.response,
    createdAt: input.result.timing.endedAt,
    ending: input.result.ending,
    blocks: input.result.blocks,
  })
  return 'ok' in judged && judged.ok.type === 'assistant' ? judged.ok : null
}
/** MR5 S-9/11/13/17/19/20: preserve actual transport facts and the durable opened time. */
export function constructModelResponse(
  input: ResponseConstructionInput,
  disposition: ReplyDisposition | null,
  systemStopWithoutReply = false,
): ResponseConstructionResult {
  const { dispatched: d, result: r, firstTokenAt } = input
  if (
    (firstTokenAt === null && r.timing.firstTokenAt !== undefined) ||
    !ordered(r.timing.sentAt, r.timing.endedAt) ||
    (firstTokenAt !== null &&
      (!ordered(r.timing.sentAt, firstTokenAt) || !ordered(firstTokenAt, r.timing.endedAt)))
  )
    return { rejected: 'invalidInput' }
  const reply = systemStopWithoutReply ? null : constructAssistantReply(input)
  const outcome = systemStopWithoutReply ? 'interrupted' : r.outcome
  const candidate: unknown = {
    id: d.response,
    dispatch: d.dispatch,
    call: { callId: d.call },
    route: {
      adaptation: d.adaptation,
      profile: d.profile,
      profileSnapshot: d.profileSnapshot,
      selectedBy: d.selectedBy,
      provider: d.provider,
      credentialScope: d.credentialScope,
      parameters: r.parameters,
      ...(r.parameterAdjustments === undefined
        ? {}
        : { parameterAdjustments: r.parameterAdjustments }),
      ...(r.droppedParameters === undefined ? {} : { droppedParameters: r.droppedParameters }),
      ...(r.upstreamModel === undefined ? {} : { upstreamModel: r.upstreamModel }),
      ...(r.servingProvider === undefined ? {} : { servingProvider: r.servingProvider }),
      ...(r.upstreamRequestId === undefined ? {} : { upstreamRequestId: r.upstreamRequestId }),
    },
    outcome,
    ...(outcome === 'interrupted' ? { initiator: 'run_cancelled' } : {}),
    ...(reply === null ? {} : { reply, replyDisposition: disposition }),
    ...(outcome === 'failed' ? { failure: r.failure } : {}),
    ...(reply === null && firstTokenAt !== null && r.blocks.length > 0
      ? { delivered: r.blocks }
      : {}),
    timing: {
      sentAt: r.timing.sentAt,
      ...(firstTokenAt === null ? {} : { firstTokenAt }),
      endedAt: r.timing.endedAt,
    },
    usage: r.usage,
    cost: r.cost,
    ...(r.trims === undefined ? {} : { trims: r.trims }),
    ...(r.stopReason === undefined ? {} : { stopReason: r.stopReason }),
    ...(r.rawHeaders === undefined ? {} : { raw: { headers: r.rawHeaders } }),
  }
  if (!response(candidate)) return { rejected: 'invalidInput' }
  const captured = captureModelLogValue({
    category: 'response',
    input: { kind: 'value', value: candidate },
  })
  if ('invalidValue' in captured || !response(captured.ok.value))
    return { rejected: 'invalidInput' }
  return { response: captured.ok.value, captured: captured.ok }
}
