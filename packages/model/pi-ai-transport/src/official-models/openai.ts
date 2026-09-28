import type { ModelAdaptationBinding } from '@omne-harness-lite/model-profile'
import { ownDefinitions, type ModelDefinition, type ModelRoute } from '../definitions.ts'

// These rules cover the supplied route behavior; parameter drops do not claim
// that the upstream models lack those parameters. Route certification is separate.
const common = {
  reminderRole: 'developer',
  parameters: {
    temperature: { kind: 'drop' },
    topP: { kind: 'drop' },
    seed: { kind: 'drop' },
    maxOutputTokens: { kind: 'pass' },
    stopSequences: { kind: 'drop' },
    frequencyPenalty: { kind: 'drop' },
    presencePenalty: { kind: 'drop' },
  },
  extra: {},
  // OpenRouter's OpenAI route caches implicitly. Its explicit OpenAI TTL uses
  // request-root prompt_cache_options, which this route language cannot emit.
  cache: { mode: 'automatic' },
} as const

// The supplied effort subsets follow the model-level published values where
// they intersect the current five-value unified domain. The endpoint reports
// the reasoning parameter but does not certify every value or conditional
// combination; live route certification remains separate.
const astra = {
  ...common,
  parameters: {
    ...common.parameters,
    reasoningEffort: {
      kind: 'select',
      accepted: { values: ['low', 'medium', 'high', 'max'] },
      otherwise: { drop: true },
    },
  },
} satisfies ModelRoute

const other = {
  ...common,
  parameters: {
    ...common.parameters,
    reasoningEffort: {
      kind: 'select',
      accepted: { values: ['none', 'low', 'medium', 'high', 'max'] },
      otherwise: { drop: true },
    },
  },
} satisfies ModelRoute

/** Explicit ID-to-route mapping; no model-prefix fallback at planning time. */
export const openaiRoutes = {
  'openai/gpt-6-astra': astra,
  'openai/gpt-6-astra-pro': astra,
  'openai/gpt-6-sol': other,
  'openai/gpt-6-sol-pro': other,
  'openai/gpt-6-luna': other,
  'openai/gpt-6-luna-pro': other,
  'openai/gpt-5.6-sol': other,
  'openai/gpt-5.6-sol-pro': other,
  'openai/gpt-5.6-terra': other,
  'openai/gpt-5.6-terra-pro': other,
  'openai/gpt-5.6-luna': other,
  'openai/gpt-5.6-luna-pro': other,
} as const satisfies Readonly<Record<string, ModelRoute>>

/** Exact model ID → provider ID → shared route policy; no prefix or provider fallback. */
export const openaiModelRoutes = {
  'openai/gpt-6-astra': { openai: openaiRoutes['openai/gpt-6-astra'] },
  'openai/gpt-6-astra-pro': { openai: openaiRoutes['openai/gpt-6-astra-pro'] },
  'openai/gpt-6-sol': { openai: openaiRoutes['openai/gpt-6-sol'] },
  'openai/gpt-6-sol-pro': { openai: openaiRoutes['openai/gpt-6-sol-pro'] },
  'openai/gpt-6-luna': { openai: openaiRoutes['openai/gpt-6-luna'] },
  'openai/gpt-6-luna-pro': { openai: openaiRoutes['openai/gpt-6-luna-pro'] },
  'openai/gpt-5.6-sol': { openai: openaiRoutes['openai/gpt-5.6-sol'] },
  'openai/gpt-5.6-sol-pro': { openai: openaiRoutes['openai/gpt-5.6-sol-pro'] },
  'openai/gpt-5.6-terra': { openai: openaiRoutes['openai/gpt-5.6-terra'] },
  'openai/gpt-5.6-terra-pro': { openai: openaiRoutes['openai/gpt-5.6-terra-pro'] },
  'openai/gpt-5.6-luna': { openai: openaiRoutes['openai/gpt-5.6-luna'] },
  'openai/gpt-5.6-luna-pro': { openai: openaiRoutes['openai/gpt-5.6-luna-pro'] },
} as const satisfies Readonly<Record<string, Readonly<Record<string, ModelRoute>>>>

// Source: .meta_harness/research/model-request-adaptation/reports/
// 2026-09-28-openai-twelve-route-facts.md and its archived endpoint bodies.
// All 12 selected OpenAI endpoints report the same 1,050,000-token shared
// window, 922,000-token max prompt, and 128,000-token max completion. Reserve
// the complete output capacity when setting the project's input-only cap.
// The 4 MiB decoded-image cap is this project's explicit offering; selected
// endpoint metadata does not establish a per-image upstream byte limit.
const capabilities = {
  inputModalities: ['image', 'text'],
  outputModalities: ['text'],
  maxInputTokens: 922000,
  maxOutputTokens: 128000,
  inputConstraints: { maxImageBytes: 4194304 },
  upstreamInputLimits: {
    maxInputTokens: { status: 'limited', value: 922000 },
    maxRequestBytes: { status: 'unknown' },
    maxImageBytes: { status: 'unknown' },
    maxImages: { status: 'unknown' },
  },
} as const satisfies ModelDefinition['capabilities']

const gpt56MeteredIds = new Set([
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-sol-pro',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-terra-pro',
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-luna-pro',
])
const gpt6TextMeteredIds = new Set(['openai/gpt-6-sol', 'openai/gpt-6-luna'])

/** Complete MP4 declarations for the exact 12 selected OpenAI routes. */
export const openaiDefinitions = ownDefinitions(
  Object.entries(openaiModelRoutes).map(
    ([modelId, routes]) =>
      ({
        modelId,
        revision: gpt56MeteredIds.has(modelId) ? '3' : gpt6TextMeteredIds.has(modelId) ? '2' : '1',
        implementation: {
          name: 'pi-ai:openai',
          revision: gpt56MeteredIds.has(modelId)
            ? 'mp4-3'
            : gpt6TextMeteredIds.has(modelId)
              ? 'mp4-2'
              : 'mp4-1',
        },
        capabilities,
        routes,
      }) satisfies ModelDefinition,
  ),
)

/** Explicit source configuration for automatic caching; never a factory default. */
export const openaiConfiguration = Object.freeze({
  revision: '1',
  values: Object.freeze({ cache: Object.freeze({ mode: 'automatic' }) }),
}) satisfies ModelAdaptationBinding['configuration']
