// Shared fixtures for the current official Moonshot bindings (definition 3 / mp4-19).
// Upstream responses built from these are controlled local TLS stand-ins only.
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import type { Message } from '@omne-harness-lite/messages'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { createOfficialProfileContent } from '../src/configuration.ts'
import type { ModelDefinition } from '../src/definitions.ts'
import type { InputMeter, MeterContribution, TokenMeasurement } from '../src/input-meter.ts'
import { object } from '../src/json.ts'
import {
  moonshotAutomaticConfiguration,
  moonshotDefinitions,
} from '../src/official-models/moonshot.ts'
import {
  at,
  content,
  finish,
  input,
  judgedMessage,
  message,
  sse,
  type CapturedRequest,
} from './support.ts'

export const moonshotModels = [
  { modelId: 'moonshotai/kimi-k3', provider: 'moonshotai/mxfp4', k3: true },
  { modelId: 'moonshotai/kimi-k2.7-code', provider: 'moonshotai/int4', k3: false },
] as const
export type MoonshotModel = (typeof moonshotModels)[number]
// The display name both selected routes reported in the archived 2026-09-27 raw streams.
export const MOONSHOT_SERVING_PROVIDER = 'Moonshot AI'
export const visible = { toHuman: true, toModel: true }
export const lookupTool: ModelToolEntry = {
  name: 'lookup__exact',
  description: 'Look up an exact value',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  },
}

export function moonshotDefinition(model: MoonshotModel): ModelDefinition {
  const definition = moonshotDefinitions.find(value => value.modelId === model.modelId)
  if (!definition) throw new Error(`missing ${model.modelId}`)
  return definition
}

/** Official profile snapshot; K2.7 Code deliberately receives the same explicit effort. */
export function moonshotRequest(
  model: MoonshotModel,
  options: {
    readonly tools?: boolean
    readonly effort?: ModelRequestParameters['reasoningEffort'] | undefined
  } = {},
): PlanInput {
  const definition = moonshotDefinition(model)
  const profile = createOfficialProfileContent(definition, {
    providers: [model.provider],
    allowFallback: false,
    configuration: moonshotAutomaticConfiguration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const base = input()
  const effort = 'effort' in options ? options.effort : 'high'
  return {
    ...base,
    routeName: definition.modelId,
    provider: model.provider,
    tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
    parameters: {
      maxOutputTokens: 512,
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
    },
    tools: options.tools ? [lookupTool] : [],
    messages: [message('system', 'Answer briefly.'), message('system_reminder', 'Stay exact.')],
    snapshot: {
      ...base.snapshot,
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
    },
  }
}

export function userTurn(round: number, image?: { bytes: Buffer; mediaType: string }): Message {
  return judgedMessage({
    type: 'user',
    id: `moonshot-user-${round}`,
    createdAt: at,
    blocks: [
      {
        id: `moonshot-user-${round}-text`,
        kind: 'text',
        text: `Turn ${round}.`,
        visibility: visible,
      },
      ...(image
        ? [
            {
              id: `moonshot-user-${round}-image`,
              kind: 'image',
              mediaType: image.mediaType,
              data: { inline: image.bytes.toString('base64') },
              visibility: visible,
            },
          ]
        : []),
    ],
  })
}

/**
 * One controlled SSE reply. `details` reproduces the archived real-route shape, where
 * each plain `reasoning` fragment is accompanied by a `reasoning_details` entry.
 */
export function moonshotReply(
  model: MoonshotModel,
  round: number,
  options: {
    readonly servingProvider?: string | undefined
    readonly toolCall?: boolean
    readonly details?: (text: string) => readonly unknown[]
  } = {},
): string {
  const reasoning = [`Think ${round}`, '.']
  const frames = reasoning.map((fragment, index) => ({
    ...(index === 0
      ? {
          id: `gen-local-${round}`,
          model: model.modelId,
          ...(options.servingProvider === undefined ? {} : { provider: options.servingProvider }),
        }
      : {}),
    choices: [
      {
        delta: {
          ...(index === 0 ? { role: 'assistant', content: '' } : {}),
          reasoning: fragment,
          ...(options.details ? { reasoning_details: options.details(fragment) } : {}),
        },
      },
    ],
  }))
  const body = options.toolCall
    ? sse({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: `call_upstream_${round}`,
                  type: 'function',
                  function: { name: lookupTool.name, arguments: '{"query":"value"}' },
                },
              ],
            },
          },
        ],
      })
    : content(`Answer ${round}.`)
  return (
    frames.map(frame => sse(frame)).join('') +
    body +
    sse({
      choices: [],
      usage: {
        prompt_tokens: 300 + round,
        completion_tokens: 7,
        prompt_tokens_details: { cached_tokens: round === 1 ? 0 : 256, cache_write_tokens: 0 },
        cost: 0.0000117,
      },
    }) +
    finish(options.toolCall ? 'tool_calls' : 'stop')
  )
}

/** Records every full/φ/δ result of the real meter without altering it. */
export function trackedMeter(original: InputMeter) {
  const calls = {
    full: [] as TokenMeasurement[],
    replay: [] as MeterContribution[],
    fresh: [] as MeterContribution[],
  }
  const meter: InputMeter = {
    ...original,
    measureFull(value) {
      const result = original.measureFull(value)
      calls.full.push(result)
      return result
    },
    measureReplay(value) {
      const result = original.measureReplay(value)
      calls.replay.push(result)
      return result
    },
    measureNew(value) {
      const result = original.measureNew(value)
      calls.fresh.push(result)
      return result
    },
  }
  return { meter, calls }
}

export function wireOf(captured: CapturedRequest | undefined) {
  if (!captured) throw new Error('missing captured request')
  const parsed = readJsonStrict(captured.body)
  if (!('ok' in parsed) || !object(parsed.ok) || !Array.isArray(parsed.ok.messages))
    throw new Error('invalid captured wire')
  return { body: parsed.ok, messages: parsed.ok.messages }
}

export function toolResult(callId: string): Message {
  return judgedMessage({
    type: 'tool',
    id: `moonshot-result-${callId}`,
    callId,
    createdAt: at,
    blocks: [
      {
        id: `moonshot-result-${callId}-block`,
        kind: 'tool_result',
        callId,
        outcome: 'completed',
        visibility: visible,
        blocks: [
          {
            id: `moonshot-result-${callId}-text`,
            kind: 'text',
            text: 'value=42',
            visibility: visible,
          },
        ],
      },
    ],
  })
}
