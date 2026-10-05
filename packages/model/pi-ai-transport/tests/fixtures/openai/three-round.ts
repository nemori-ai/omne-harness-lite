import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { ModelInvocationResult, PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import {
  createOfficialProfileContent,
  openaiConfiguration,
} from '@omne-harness-lite/pi-ai-transport'
import { type ModelDefinition } from '@omne-harness-lite/model-request-runtime'
import { judgedMessage, message } from '../../support.ts'

const at = '2026-09-30T00:00:00Z'
const visible = { toHuman: true, toModel: true }
/** Stable system text; marginal rounds must never send it to the tokenizer again. */
export const openAiStablePrefix = 'OPENAI_STABLE_PREFIX: answer briefly and keep the code.'

export const openAiFamilyTool: ModelToolEntry = {
  name: 'lookup_code',
  description: 'Look up the remembered code by key. No external side effects.',
  parameters: {
    type: 'object',
    properties: { key: { type: 'string' } },
    required: ['key'],
    additionalProperties: false,
  },
}

/**
 * Credential-free first round on the official OpenAI binding: exact provider,
 * no fallback, explicit automatic cache configuration, one inline PNG.
 */
export function openAiThreeRoundInput(
  definition: ModelDefinition,
  withTools: boolean,
  pngBase64: string,
): PlanInput {
  const profile = createOfficialProfileContent(definition, {
    providers: ['openai'],
    allowFallback: false,
    configuration: openaiConfiguration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  return {
    calibration: { kind: 'none', reason: 'no_observation' },
    outputHistory: [],
    tokenMargin: { multiplier: 1.1, reserveTokens: 7 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('openai-three-round-1', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: definition.modelId,
    provider: 'openai',
    snapshot: {
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
      updatedAt: at,
    },
    parameters: { reasoningEffort: 'high', maxOutputTokens: 1024 },
    messages: [
      message('system', openAiStablePrefix, 'openai-three-round-system'),
      message('user', 'Remember the code ALPHA-42 and name the image color.', 'openai-user-1'),
      judgedMessage({
        id: 'openai-user-image',
        type: 'user',
        createdAt: at,
        blocks: [
          {
            id: 'openai-image',
            kind: 'image',
            mediaType: 'image/png',
            data: { inline: pngBase64 },
            visibility: visible,
          },
        ],
      }),
    ],
    tools: withTools ? [openAiFamilyTool] : [],
  }
}

/**
 * Append one complete same-binding reply exactly as returned, plus explicitly
 * supplied tool results and the next user turn. Tool execution stays outside.
 */
export function appendOpenAiRound(
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
    throw new TypeError('response is not a complete same-binding OpenAI reply')
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
      callId: unwrap(parseOpaqueIdentifier(`openai-three-round-${next.round}`, 'ModelCallId')),
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
        id: `openai-three-round-assistant-${next.round - 1}`,
        type: 'assistant',
        response: `openai-three-round-response-${next.round - 1}`,
        ending: response.ending,
        createdAt: at,
        blocks: response.blocks,
      }),
      ...results.map((result, index) =>
        judgedMessage({
          id: `openai-three-round-tool-${next.round}-${index}`,
          type: 'tool',
          callId: result.callId,
          createdAt: at,
          blocks: [
            {
              id: `openai-three-round-tool-block-${next.round}-${index}`,
              kind: 'tool_result',
              callId: result.callId,
              outcome: 'completed',
              visibility: visible,
              blocks: [
                {
                  id: `openai-three-round-tool-text-${next.round}-${index}`,
                  kind: 'text',
                  text: result.text,
                  visibility: visible,
                },
              ],
            },
          ],
        }),
      ),
      message('user', next.text, `openai-three-round-user-${next.round}`),
    ],
  }
}
