import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { ModelInvocationResult, PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import type { ModelDefinition } from '@omne-harness-lite/model-request-runtime'
import { googleCertificationRequest, googleCertificationTool } from './cases.ts'
import { judgedMessage, message } from '../../support.ts'

export type GoogleEffort = 'low' | 'medium' | 'high'
const at = '2026-09-30T00:00:00Z'
const visible = { toHuman: true, toModel: true }

/** Credential-free first round on the official AI Studio binding; no paid execution here. */
export function googleThreeRoundInput(
  modelId: string,
  effort: GoogleEffort,
  withTools: boolean,
  declared?: ModelDefinition,
): PlanInput {
  const base = googleCertificationRequest(modelId, declared)
  return {
    ...base,
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('google-three-round-1', 'ModelCallId')),
      dispatch: 1,
    },
    parameters: { reasoningEffort: effort, maxOutputTokens: 1024 },
    messages: [
      message('system', 'Answer briefly.', 'google-three-round-system'),
      message('user', 'Remember the code ALPHA-42.', 'google-three-round-user-1'),
    ],
    tools: withTools ? [googleCertificationTool] : [],
  }
}

/**
 * Append one complete same-binding reply exactly as returned, plus explicitly
 * supplied tool results and the next user turn. Tool execution stays outside.
 */
export function appendGoogleRound(
  previous: PlanInput,
  response: ModelInvocationResult,
  next: {
    readonly round: number
    readonly text: string
    readonly toolResults?: readonly { readonly callId: string; readonly text: string }[]
  },
): PlanInput {
  if (
    !Number.isSafeInteger(next.round) ||
    next.round < 2 ||
    response.outcome !== 'complete' ||
    response.ending !== 'complete' ||
    response.routeName !== previous.routeName ||
    response.provider !== previous.provider ||
    writeJsonLossless(response.adaptation) !== writeJsonLossless(previous.snapshot.adaptation)
  )
    throw new TypeError('response is not a complete same-binding Google reply')
  const calls = response.blocks.filter(block => block.kind === 'tool_call')
  const results = next.toolResults ?? []
  if (
    calls.some(call => !call.complete) ||
    results.length !== calls.length ||
    results.some(result => !calls.some(call => call.callId === result.callId))
  )
    throw new TypeError('tool calls require matching explicit tool results')
  const replaySelection = response.blocks.map((_, blockIndex) => ({
    sourceBlockIndex: blockIndex,
    messageIndex: previous.messages.length,
    blockIndex,
  }))
  const group: PlanOutputHistoryGroup = {
    inputCalibration: response.inputCalibration,
    usage: response.usage,
    outputBlocks: response.blocks,
    replaySelection,
    origin: {
      adaptation: response.adaptation,
      provider: response.provider,
      parameters: response.parameters,
      ...(response.servingProvider === undefined
        ? {}
        : { servingProvider: response.servingProvider }),
      ...(response.upstreamModel === undefined ? {} : { upstreamModel: response.upstreamModel }),
    },
  }
  return {
    ...previous,
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier(`google-three-round-${next.round}`, 'ModelCallId')),
      dispatch: 1,
    },
    calibration: {
      kind: 'observation',
      inputCalibration: group.inputCalibration,
      usage: group.usage,
      outputBlocks: group.outputBlocks,
      replaySelection,
    },
    outputHistory: [...previous.outputHistory, group],
    messages: [
      ...previous.messages,
      judgedMessage({
        id: `google-three-round-assistant-${next.round - 1}`,
        type: 'assistant',
        response: `google-three-round-response-${next.round - 1}`,
        ending: response.ending,
        createdAt: at,
        blocks: response.blocks,
      }),
      ...results.map((result, index) =>
        judgedMessage({
          id: `google-three-round-tool-${next.round}-${index}`,
          type: 'tool',
          callId: result.callId,
          createdAt: at,
          blocks: [
            {
              id: `google-three-round-tool-block-${next.round}-${index}`,
              kind: 'tool_result',
              callId: result.callId,
              outcome: 'completed',
              visibility: visible,
              blocks: [
                {
                  id: `google-three-round-tool-text-${next.round}-${index}`,
                  kind: 'text',
                  text: result.text,
                  visibility: visible,
                },
              ],
            },
          ],
        }),
      ),
      message('user', next.text, `google-three-round-user-${next.round}`),
    ],
  }
}
