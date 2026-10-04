import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import type {
  ModelInvocationResult,
  PlanInput,
  PlanOutputHistoryGroup,
} from '@omne-harness-lite/model-request-runtime-local'
import { createOfficialProfileContent, xaiDefinitions } from '@omne-harness-lite/pi-ai-transport'

/** Credential-free scenario construction. The caller alone owns paid execution. */
export function xaiCloseoutInput(model: string, at: string): PlanInput {
  const definition = xaiDefinitions.find(value => value.modelId === model)
  if (!definition) throw new TypeError('unknown xAI closeout model')
  const profile = createOfficialProfileContent(definition, {
    providers: ['xai'],
    allowFallback: false,
    configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
  })
  if ('rejected' in profile) throw new TypeError(profile.rejected)
  return {
    calibration: { kind: 'none', reason: 'no_observation' },
    outputHistory: [],
    target: { kind: 'model_call', callId: 'xai-closeout-1', dispatch: 1 },
    tokenMargin: { multiplier: 1.1, reserveTokens: 256 },
    routeName: model,
    provider: 'xai',
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
    parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
    messages: [
      message({
        id: 'xai-closeout-user-1',
        type: 'user',
        createdAt: at,
        blocks: [
          {
            id: 'text-1',
            kind: 'text',
            text: 'Remember the code ALPHA-42. Reply briefly.',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      }),
    ],
    tools: [],
  }
}

function message(value: unknown): Message {
  const judged = judgeMessage(value)
  if ('rejected' in judged) throw new TypeError(`invalid closeout message: ${judged.rejected}`)
  return judged.ok
}

/** Keep all original blocks and observation facts. No opaque decoding or token inference. */
export function appendXaiCloseoutResponse(
  previous: PlanInput,
  response: ModelInvocationResult,
  next: {
    readonly round: number
    readonly at: string
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
    response.provider !== 'xai' ||
    writeJsonLossless(response.adaptation) !== writeJsonLossless(previous.snapshot.adaptation)
  )
    throw new TypeError('response is not a complete same-binding xAI reply')
  // Tool execution is outside this harness. Only explicitly supplied results may be appended.
  const calls = response.blocks.filter(block => block.kind === 'tool_call')
  const results = next.toolResults ?? []
  if (
    calls.some(call => !call.complete) ||
    results.length !== calls.length ||
    new Set(results.map(result => result.callId)).size !== results.length ||
    results.some(result => !calls.some(call => call.callId === result.callId))
  )
    throw new TypeError('tool calls require matching explicit tool results')
  const assistant = message({
    id: `xai-closeout-assistant-${next.round - 1}`,
    type: 'assistant',
    response: `xai-closeout-response-${next.round - 1}`,
    ending: response.ending,
    createdAt: next.at,
    blocks: response.blocks,
  })
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
  const toolMessages = results.map((result, index) =>
    message({
      id: `xai-closeout-tool-${next.round}-${index}`,
      type: 'tool',
      callId: result.callId,
      createdAt: next.at,
      blocks: [
        {
          id: `xai-closeout-tool-block-${next.round}-${index}`,
          kind: 'tool_result',
          callId: result.callId,
          outcome: 'completed',
          visibility: { toHuman: true, toModel: true },
          blocks: [
            {
              id: `xai-closeout-tool-text-${next.round}-${index}`,
              kind: 'text',
              text: result.text,
              visibility: { toHuman: true, toModel: true },
            },
          ],
        },
      ],
    }),
  )
  return {
    ...previous,
    target: { kind: 'model_call', callId: `xai-closeout-${next.round}`, dispatch: 1 },
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
      assistant,
      ...toolMessages,
      message({
        id: `xai-closeout-user-${next.round}`,
        type: 'user',
        createdAt: next.at,
        blocks: [
          {
            id: `text-${next.round}`,
            kind: 'text',
            text: next.text,
            visibility: { toHuman: true, toModel: true },
          },
        ],
      }),
    ],
  }
}
