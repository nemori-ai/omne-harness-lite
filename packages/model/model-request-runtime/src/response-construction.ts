import {
  judgeMessage,
  type AssistantMessage,
  type MessageId,
  type ModelCallDispatchedRecord,
} from '@omne-harness-lite/messages'
import {
  judgeModelResponse,
  judgePendingModelResponse,
  type ModelResponse,
  type PendingModelResponse,
  type ReplyDisposition,
  type InputCalibration,
} from '@omne-harness-lite/model-response'
import { compareRfc3339Instants } from '@omne-harness-lite/offer-expiry'
import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import { captureModelLogValue, modelLogJsonEqual } from './log-codec.ts'
import { reconstructAdaptedParameters } from './log-codec-settlement.ts'
import type {
  InvocationObservedFacts,
  ModelInvocationResult,
  OutputProjectionInput,
  OutputProjectionResult,
} from './types.ts'
import type { ResponseConstructionResult } from './anchored-invocation-types.ts'

export interface ResponseConstructionInput {
  readonly dispatched: ModelCallDispatchedRecord
  readonly run?: RunId
  readonly attempt?: AttemptId
  readonly result: ModelInvocationResult
  readonly messageId: MessageId
  /** Actual confirmed original opened timestamp; null means definitively unopened. */
  readonly firstTokenAt: string | null
  /** Present only after the original S-31 intent append was confirmed. */
  readonly interruptInitiator?: 'user' | 'run_cancelled'
  /** Original fixed transport projection, borrowed only before the durable batch is formed. */
  readonly projectOutput?: (input: OutputProjectionInput) => OutputProjectionResult
}
/** Only an owner that confirmed a durable dispatched anchor may call this path. */
interface AnchoredInterruptionBase {
  readonly dispatched: ModelCallDispatchedRecord
  readonly run?: RunId
  readonly attempt?: AttemptId
  /** When the original process still has the fixed plan, verify it against the anchor. */
  readonly planned?: {
    readonly parameters: ModelInvocationResult['parameters']
    readonly parameterAdjustments?: ModelInvocationResult['parameterAdjustments']
    readonly droppedParameters?: ModelInvocationResult['droppedParameters']
  }
  readonly firstTokenAt: string | null
  readonly endedAt: string
  readonly initiator: 'user' | 'run_cancelled' | 'runtime_lost'
}
export type AnchoredInterruptionInput = AnchoredInterruptionBase &
  (
    | { readonly observed: InvocationObservedFacts; readonly sendState?: never }
    | { readonly observed: null; readonly sendState: 'not_sent' | 'send_unknown' }
  )
function response(value: unknown): value is ModelResponse {
  return 'ok' in judgeModelResponse(value)
}
function pendingResponse(value: unknown): value is PendingModelResponse {
  return 'ok' in judgePendingModelResponse(value)
}
function ordered(a: string, b: string): boolean {
  const order = compareRfc3339Instants(a, b)
  return 'ok' in order && order.ok <= 0
}
/** S-31 may return interrupted content; S-36 abandons it without a reply. */
export function constructAssistantReply(input: ResponseConstructionInput): AssistantMessage | null {
  if (
    input.result.ending === undefined ||
    input.firstTokenAt === null ||
    (input.result.outcome === 'interrupted' &&
      (input.interruptInitiator === undefined || input.result.ending !== 'interrupted_by_user'))
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
/** Preserve every transport fact before the reply writer selects a disposition. */
function responseFacts(
  input: ResponseConstructionInput,
  disposition?: ReplyDisposition | null,
  systemStopWithoutReply = false,
): Record<string, unknown> | null {
  const { dispatched: d, result: r, firstTokenAt } = input
  if (
    (firstTokenAt === null && r.timing.firstTokenAt !== undefined) ||
    !ordered(r.timing.sentAt, r.timing.endedAt) ||
    (firstTokenAt !== null &&
      (!ordered(r.timing.sentAt, firstTokenAt) || !ordered(firstTokenAt, r.timing.endedAt)))
  )
    return null
  const reply = systemStopWithoutReply ? null : constructAssistantReply(input)
  const outcome = systemStopWithoutReply ? 'interrupted' : r.outcome
  const outputSource =
    reply !== null ? 'reply' : firstTokenAt !== null && r.blocks.length > 0 ? 'delivered' : 'none'
  let inputCalibration: InputCalibration = r.inputCalibration
  const priorGroup = inputCalibration.outputGroup
  if (priorGroup.kind === 'known' && priorGroup.source !== outputSource) {
    if (input.projectOutput === undefined) return null
    const projected = input.projectOutput({
      blocks: outputSource === 'none' ? [] : r.blocks,
      source: outputSource,
      completeness: priorGroup.completeness,
    })
    if ('invalidInput' in projected) return null
    inputCalibration = {
      ...inputCalibration,
      outputGroup:
        'projected' in projected
          ? projected.projected
          : { kind: 'unavailable', reason: 'not_retained' },
    }
  }
  const candidate: Record<string, unknown> = {
    id: d.response,
    dispatch: d.dispatch,
    call: { callId: d.call, ...(input.run === undefined ? {} : { runId: input.run }) },
    ...(input.attempt === undefined ? {} : { attemptId: input.attempt }),
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
    ...(outcome === 'interrupted'
      ? {
          initiator: systemStopWithoutReply
            ? 'run_cancelled'
            : (input.interruptInitiator ?? 'run_cancelled'),
        }
      : {}),
    ...(reply === null
      ? {}
      : disposition === undefined
        ? { reply }
        : { reply, replyDisposition: disposition }),
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
    inputCalibration,
    ...(r.trims === undefined ? {} : { trims: r.trims }),
    ...(r.stopReason === undefined ? {} : { stopReason: r.stopReason }),
    ...(r.rawHeaders === undefined ? {} : { raw: { headers: r.rawHeaders } }),
  }
  return candidate
}

/** MR7 S-39/S-75: complete reply facts, without disposition or premature late. */
export function constructPendingModelResponse(
  input: ResponseConstructionInput,
): { readonly pending: PendingModelResponse } | { readonly rejected: 'invalidInput' } {
  const candidate = responseFacts(input)
  if (candidate === null) return { rejected: 'invalidInput' }
  return pendingResponse(candidate) ? { pending: candidate } : { rejected: 'invalidInput' }
}

/** MR7 S-9/11/13/17/19/20: preserve actual facts in the persisted response. */
export function constructModelResponse(
  input: ResponseConstructionInput,
  disposition: ReplyDisposition | null,
  systemStopWithoutReply = false,
): ResponseConstructionResult {
  const candidate = responseFacts(input, disposition, systemStopWithoutReply)
  if (candidate === null || !response(candidate)) return { rejected: 'invalidInput' }
  const captured = captureModelLogValue({
    category: 'response',
    input: { kind: 'value', value: candidate },
  })
  if ('invalidValue' in captured || !response(captured.ok.value))
    return { rejected: 'invalidInput' }
  return { response: captured.ok.value, captured: captured.ok }
}

/** MR8/RT9: settle an anchored interruption without fabricating a normal invocation result. */
export function constructAnchoredInterruption(
  input: AnchoredInterruptionInput,
): ResponseConstructionResult {
  const { dispatched: d, planned, observed, firstTokenAt, endedAt } = input
  const parameters = reconstructAdaptedParameters(d)
  if (
    parameters === undefined ||
    (planned !== undefined &&
      (!modelLogJsonEqual(parameters, planned.parameters) ||
        !modelLogJsonEqual(d.parameterAdjustments, planned.parameterAdjustments) ||
        !modelLogJsonEqual(d.droppedParameters, planned.droppedParameters)))
  )
    return { rejected: 'invalidInput' }
  const sentAt = observed?.sentAt ?? null
  const inputCalibration: InputCalibration = observed
    ? {
        requestInput: observed.inputCalibration.requestInput,
        observedInput: observed.inputCalibration.observedInput,
        outputGroup:
          observed.inputCalibration.outputGroup.kind === 'known' &&
          observed.inputCalibration.outputGroup.source === 'none'
            ? observed.inputCalibration.outputGroup
            : { kind: 'unavailable', reason: 'not_retained' },
      }
    : {
        // Only the original owner may establish not_sent; a cold absent owner is unknown.
        requestInput: { kind: 'unavailable', reason: input.sendState },
        observedInput: { kind: 'unavailable', reason: input.sendState },
        outputGroup: { kind: 'unavailable', reason: input.sendState },
      }
  if (
    (sentAt !== null && !ordered(sentAt, firstTokenAt ?? endedAt)) ||
    (firstTokenAt !== null && !ordered(firstTokenAt, endedAt))
  )
    return { rejected: 'invalidInput' }
  const candidate = {
    id: d.response,
    dispatch: d.dispatch,
    call: { callId: d.call, ...(input.run === undefined ? {} : { runId: input.run }) },
    ...(input.attempt === undefined ? {} : { attemptId: input.attempt }),
    route: {
      adaptation: d.adaptation,
      profile: d.profile,
      profileSnapshot: d.profileSnapshot,
      selectedBy: d.selectedBy,
      provider: d.provider,
      credentialScope: d.credentialScope,
      parameters,
      ...(d.parameterAdjustments === undefined
        ? {}
        : { parameterAdjustments: d.parameterAdjustments }),
      ...(d.droppedParameters === undefined ? {} : { droppedParameters: d.droppedParameters }),
      ...(observed?.upstreamModel === undefined ? {} : { upstreamModel: observed.upstreamModel }),
      ...(observed?.servingProvider === undefined
        ? {}
        : { servingProvider: observed.servingProvider }),
      ...(observed?.upstreamRequestId === undefined
        ? {}
        : { upstreamRequestId: observed.upstreamRequestId }),
    },
    outcome: 'interrupted',
    initiator: input.initiator,
    timing: { sentAt, ...(firstTokenAt === null ? {} : { firstTokenAt }), endedAt },
    usage: observed?.usage ?? {
      input_tokens: 'unknown',
      output_tokens: 'unknown',
      cache_read_tokens: 'unknown',
      cache_write_tokens: 'unknown',
      source: 'none',
    },
    cost: observed?.cost ?? { cost_usd: 'unknown', source: 'none' },
    inputCalibration,
    ...(observed?.trims === undefined ? {} : { trims: observed.trims }),
    ...(observed?.stopReason === undefined ? {} : { stopReason: observed.stopReason }),
    ...(observed?.rawHeaders === undefined ? {} : { raw: { headers: observed.rawHeaders } }),
  }
  if (!response(candidate)) return { rejected: 'invalidInput' }
  const captured = captureModelLogValue({
    category: 'response',
    input: { kind: 'value', value: candidate },
  })
  return 'ok' in captured && response(captured.ok.value)
    ? { response: captured.ok.value, captured: captured.ok }
    : { rejected: 'invalidInput' }
}
