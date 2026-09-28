import {
  ownDefinitions,
  type ModelDefinition,
  type ModelRoute,
  type ParameterRules,
} from '../definitions.ts'

// A supplied request subset. Dropped parameters remain visible in planning
// history; this does not assert that Alibaba's models reject those parameters.
const common = {
  temperature: { kind: 'drop' },
  topP: { kind: 'drop' },
  seed: { kind: 'drop' },
  maxOutputTokens: { kind: 'pass' },
  stopSequences: { kind: 'drop' },
  frequencyPenalty: { kind: 'drop' },
  presencePenalty: { kind: 'drop' },
} as const

const unverifiedEffort = {
  ...common,
  reasoningEffort: { kind: 'drop' },
} satisfies ParameterRules

// The fixed Alibaba endpoint rejects `none` on Max and 2.4T, while OpenRouter
// observed `high` and `max` accepted. `minimal` is not in the unified domain.
const mandatoryReasoning = {
  ...common,
  reasoningEffort: {
    kind: 'select',
    accepted: { values: ['high', 'max'] },
    otherwise: { drop: true },
  },
} satisfies ParameterRules

// OpenRouter observed `none` on 27B via Alibaba; other values below share the
// same controlled observation as Max and 2.4T.
const switchableReasoning = {
  ...common,
  reasoningEffort: {
    kind: 'select',
    accepted: { values: ['none', 'high', 'max'] },
    otherwise: { drop: true },
  },
} satisfies ParameterRules

/** Exact target identities. */
export const qwenAlibabaModelIds = Object.freeze([
  'qwen/qwen3.8-max-0902',
  'qwen/qwen3.8-max-prime',
  'qwen/qwen3.8-flash',
  'qwen/qwen3.8-2.4t-a95b',
  'qwen/qwen3.8-27b',
  'qwen/qwen3.7-max',
  'qwen/qwen3.7-plus',
  'qwen/qwen3.7-flash',
] as const)

export type QwenAlibabaModelId = (typeof qwenAlibabaModelIds)[number]

export const qwenAlibabaParameters = Object.freeze({
  'qwen/qwen3.8-max-0902': mandatoryReasoning,
  'qwen/qwen3.8-max-prime': unverifiedEffort,
  'qwen/qwen3.8-flash': unverifiedEffort,
  'qwen/qwen3.8-2.4t-a95b': mandatoryReasoning,
  'qwen/qwen3.8-27b': switchableReasoning,
  'qwen/qwen3.7-max': unverifiedEffort,
  'qwen/qwen3.7-plus': unverifiedEffort,
  'qwen/qwen3.7-flash': unverifiedEffort,
} satisfies Record<QwenAlibabaModelId, ParameterRules>)

// The controlled probe sent this exact 5m control on the system text block for
// six Alibaba routes and received HTTP 200 with warm reads. That does not prove
// the upstream honored the control or retained a cache for five minutes.
const explicitSystemCache = {
  mode: 'explicit',
  ttlValues: ['5m'],
  breakpointLayouts: [['system']],
} as const

function explicitRoute(parameters: ParameterRules): ModelRoute {
  return { reminderRole: 'user', parameters, extra: {}, cache: explicitSystemCache }
}

// The two Flash routes had warm reads without any explicit control.
export const qwen38FlashAlibabaRoute = {
  reminderRole: 'user',
  parameters: qwenAlibabaParameters['qwen/qwen3.8-flash'],
  extra: {},
  cache: { mode: 'automatic' },
} satisfies ModelRoute

export const qwen37FlashAlibabaRoute = {
  reminderRole: 'user',
  parameters: qwenAlibabaParameters['qwen/qwen3.7-flash'],
  extra: {},
  cache: { mode: 'automatic' },
} satisfies ModelRoute

export const qwenAlibabaRoutes = Object.freeze({
  'qwen/qwen3.8-max-0902': explicitRoute(qwenAlibabaParameters['qwen/qwen3.8-max-0902']),
  'qwen/qwen3.8-max-prime': explicitRoute(qwenAlibabaParameters['qwen/qwen3.8-max-prime']),
  'qwen/qwen3.8-flash': qwen38FlashAlibabaRoute,
  'qwen/qwen3.8-2.4t-a95b': explicitRoute(qwenAlibabaParameters['qwen/qwen3.8-2.4t-a95b']),
  'qwen/qwen3.8-27b': explicitRoute(qwenAlibabaParameters['qwen/qwen3.8-27b']),
  'qwen/qwen3.7-max': explicitRoute(qwenAlibabaParameters['qwen/qwen3.7-max']),
  'qwen/qwen3.7-plus': explicitRoute(qwenAlibabaParameters['qwen/qwen3.7-plus']),
  'qwen/qwen3.7-flash': qwen37FlashAlibabaRoute,
} satisfies Record<QwenAlibabaModelId, ModelRoute>)

/** Exact model ID → provider ID → shared route policy; no prefix or provider fallback. */
export const qwenModelRoutes = {
  'qwen/qwen3.8-max-0902': { alibaba: qwenAlibabaRoutes['qwen/qwen3.8-max-0902'] },
  'qwen/qwen3.8-max-prime': { alibaba: qwenAlibabaRoutes['qwen/qwen3.8-max-prime'] },
  'qwen/qwen3.8-flash': { alibaba: qwenAlibabaRoutes['qwen/qwen3.8-flash'] },
  'qwen/qwen3.8-2.4t-a95b': { alibaba: qwenAlibabaRoutes['qwen/qwen3.8-2.4t-a95b'] },
  'qwen/qwen3.8-27b': { alibaba: qwenAlibabaRoutes['qwen/qwen3.8-27b'] },
  'qwen/qwen3.7-max': { alibaba: qwenAlibabaRoutes['qwen/qwen3.7-max'] },
  'qwen/qwen3.7-plus': { alibaba: qwenAlibabaRoutes['qwen/qwen3.7-plus'] },
  'qwen/qwen3.7-flash': { alibaba: qwenAlibabaRoutes['qwen/qwen3.7-flash'] },
} as const satisfies Readonly<Record<string, Readonly<Record<string, ModelRoute>>>>

// Selected Alibaba endpoint facts are recorded per model in
// research/model-request-adaptation/first-party-and-joint-2026-09-27.tar.gz.
// Project input caps reserve the endpoint's full reported output capacity from
// the shared 1,000,000-token window. A numeric max_prompt_tokens remains an
// independent upstream fact even when the project cap is smaller.
const unknown = { status: 'unknown' } as const
const reportedPrompt = { status: 'limited', value: 983616 } as const
const imageConstraints = { maxImageBytes: 4 * 1024 * 1024 } as const
const imageFacts = { maxImageBytes: unknown, maxImages: unknown } as const

const offer = {
  'qwen/qwen3.8-max-0902': {
    inputModalities: ['image', 'text', 'video'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: imageConstraints,
    upstreamInputLimits: {
      maxInputTokens: reportedPrompt,
      maxRequestBytes: unknown,
      ...imageFacts,
    },
  },
  'qwen/qwen3.8-max-prime': {
    inputModalities: ['image', 'text', 'video'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: imageConstraints,
    upstreamInputLimits: {
      maxInputTokens: reportedPrompt,
      maxRequestBytes: unknown,
      ...imageFacts,
    },
  },
  'qwen/qwen3.8-flash': {
    inputModalities: ['image', 'text', 'video'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: imageConstraints,
    upstreamInputLimits: {
      maxInputTokens: reportedPrompt,
      maxRequestBytes: unknown,
      ...imageFacts,
    },
  },
  'qwen/qwen3.8-2.4t-a95b': {
    inputModalities: ['text'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: {},
    upstreamInputLimits: { maxInputTokens: unknown, maxRequestBytes: unknown },
  },
  'qwen/qwen3.8-27b': {
    inputModalities: ['image', 'text', 'video'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: imageConstraints,
    upstreamInputLimits: { maxInputTokens: unknown, maxRequestBytes: unknown, ...imageFacts },
  },
  'qwen/qwen3.7-max': {
    inputModalities: ['text'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: {},
    upstreamInputLimits: { maxInputTokens: reportedPrompt, maxRequestBytes: unknown },
  },
  'qwen/qwen3.7-plus': {
    inputModalities: ['image', 'text'],
    maxInputTokens: 868928,
    maxOutputTokens: 131072,
    inputConstraints: imageConstraints,
    upstreamInputLimits: {
      maxInputTokens: reportedPrompt,
      maxRequestBytes: unknown,
      ...imageFacts,
    },
  },
  'qwen/qwen3.7-flash': {
    inputModalities: ['image', 'text', 'video'],
    maxInputTokens: 934464,
    maxOutputTokens: 65536,
    inputConstraints: imageConstraints,
    upstreamInputLimits: {
      maxInputTokens: reportedPrompt,
      maxRequestBytes: unknown,
      ...imageFacts,
    },
  },
} as const

/** Complete MP4 declarations. Reading and registration use the common validator. */
export const qwenDefinitions = ownDefinitions(
  qwenAlibabaModelIds.map(
    modelId =>
      ({
        modelId,
        revision: '1',
        implementation: {
          name: 'pi-ai:qwen',
          revision:
            modelId === 'qwen/qwen3.8-2.4t-a95b' || modelId === 'qwen/qwen3.8-27b'
              ? 'mp4-2'
              : 'mp4-1',
        },
        capabilities: { ...offer[modelId], outputModalities: ['text'] },
        routes: qwenModelRoutes[modelId],
      }) satisfies ModelDefinition,
  ),
)
