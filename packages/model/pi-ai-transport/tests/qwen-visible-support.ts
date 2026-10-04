// Fixtures for the adopted Qwen open-leaf visible reasoning estimate (revision 2) at the
// current bindings (definition 4 / mp4-19). The six archived 2026-09-27 raw streams
// (fixtures/qwen/visible-reasoning-fragments.json) are rebuilt in their exact delta shape
// through the shared archived-shape helpers. Every response is a controlled local TLS
// stand-in, never an OpenRouter or Alibaba observation.
import { readFileSync } from 'node:fs'
import type { Message } from '@omne-harness-lite/messages'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime-local'
import { createOfficialProfileContent } from '../src/configuration.ts'
import type { ModelDefinition } from '../src/definitions.ts'
import type { InputMeter } from '../src/input-meter.ts'
import { createQwenInputMeter } from '../src/input-meters/qwen.ts'
import { qwenDefinitions } from '../src/official-models/qwen.ts'
import { lookupTool, visible } from './moonshot-support.ts'
import {
  archivedFor,
  loadArchivedStreams,
  type ArchivedStream,
} from './moonshot-visible-support.ts'
import { at, input, judgedMessage, message } from './support.ts'

export const qwenOpenModels = [
  { modelId: 'qwen/qwen3.8-2.4t-a95b', image: false },
  { modelId: 'qwen/qwen3.8-27b', image: true },
] as const
export type QwenOpenModel = (typeof qwenOpenModels)[number]
// The display name both open leaves reported in the archived and QV0 raw streams.
export const QWEN_SERVING_PROVIDER = 'Alibaba'
export type QwenEffort = 'high' | 'max' | undefined
// Absent effort renders the template default; high/max are the route's declared values.
export const qwenEfforts: readonly QwenEffort[] = [undefined, 'high', 'max']
export const redPng = readFileSync(new URL('./fixtures/qwen/public-red-544.png', import.meta.url))

export const qwenArchivedStreams = loadArchivedStreams(
  new URL('./fixtures/qwen/visible-reasoning-fragments.json', import.meta.url),
)

export function qwenArchivedFor(model: QwenOpenModel): readonly ArchivedStream[] {
  return archivedFor(model, qwenArchivedStreams)
}

export function qwenDefinition(model: QwenOpenModel): ModelDefinition {
  const definition = qwenDefinitions.find(value => value.modelId === model.modelId)
  if (!definition) throw new Error(`missing ${model.modelId}`)
  return definition
}

// Each factory call loads and verifies the pinned tokenizer; meters are pure, so share one.
const meters = new Map<string, InputMeter>()
export function qwenMeter(model: QwenOpenModel): InputMeter {
  const cached = meters.get(model.modelId)
  if (cached) return cached
  const meter = createQwenInputMeter(qwenDefinition(model))
  meters.set(model.modelId, meter)
  return meter
}

/** Official profile snapshot with the route's required explicit 5m `system` cache. */
export function qwenRequest(
  model: QwenOpenModel,
  options: {
    readonly tools?: boolean
    readonly effort?: ModelRequestParameters['reasoningEffort'] | undefined
  } = {},
): PlanInput {
  const definition = qwenDefinition(model)
  const profile = createOfficialProfileContent(definition, {
    providers: ['alibaba'],
    allowFallback: false,
    configuration: {
      revision: 'qwen-visible-reasoning-1',
      values: { cache: { mode: 'explicit', ttl: '5m', breakpoints: ['system'] } },
    },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const base = input()
  return {
    ...base,
    routeName: definition.modelId,
    provider: 'alibaba',
    tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
    parameters: {
      maxOutputTokens: 512,
      ...(options.effort === undefined ? {} : { reasoningEffort: options.effort }),
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

export function qwenUserTurn(round: number, image = false): Message {
  return judgedMessage({
    type: 'user',
    id: `qwen-user-${round}`,
    createdAt: at,
    blocks: [
      { id: `qwen-user-${round}-text`, kind: 'text', text: `Turn ${round}.`, visibility: visible },
      ...(image
        ? [
            {
              id: `qwen-user-${round}-image`,
              kind: 'image',
              mediaType: 'image/png',
              data: { inline: redPng.toString('base64') },
              visibility: visible,
            },
          ]
        : []),
    ],
  })
}

export function qwenToolResult(callId: string): Message {
  return judgedMessage({
    type: 'tool',
    id: `qwen-result-${callId}`,
    callId,
    createdAt: at,
    blocks: [
      {
        id: `qwen-result-${callId}-block`,
        kind: 'tool_result',
        callId,
        outcome: 'completed',
        visibility: visible,
        blocks: [
          { id: `qwen-result-${callId}-text`, kind: 'text', text: 'value=42', visibility: visible },
        ],
      },
    ],
  })
}
