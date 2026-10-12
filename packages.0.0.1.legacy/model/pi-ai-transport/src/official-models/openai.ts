import {
  openAiFamilyRecords,
  OPENAI_FAMILY_IMPLEMENTATION,
} from '../input-meters/openai-family-policy.ts'
import type { ModelAdaptationBinding } from '@omne-harness-lite/model-profile'
import { ownDefinitions } from '../definitions.ts'
import { type ModelDefinition, type ModelRoute } from '@omne-harness-lite/model-request-runtime'

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
/** Model names and effort domains come from the one finite family table. */
export const openaiRoutes = Object.fromEntries(
  Object.entries(openAiFamilyRecords).map(([modelId, record]) => [
    modelId,
    {
      ...common,
      parameters: {
        ...common.parameters,
        reasoningEffort: {
          kind: 'select',
          accepted: { values: record.efforts },
          otherwise: { drop: true },
        },
      },
    } satisfies ModelRoute,
  ]),
)

/** Exact model and provider mapping; no prefix or provider fallback. */
export const openaiModelRoutes = Object.fromEntries(
  Object.entries(openaiRoutes).map(([modelId, route]) => [modelId, { openai: route }]),
)

// Selected OpenRouter endpoint metadata observed on 2026-09-28.
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

/** Complete MP4 declarations; the family record is the sole current binding source. */
export const openaiDefinitions = ownDefinitions(
  Object.entries(openaiModelRoutes).map(([modelId, routes]) => {
    const record = openAiFamilyRecords[modelId]
    if (!record) throw new TypeError(`Missing OpenAI family record: ${modelId}`)
    return {
      modelId,
      revision: record.definitionRevision,
      implementation: { name: 'pi-ai:openai', revision: OPENAI_FAMILY_IMPLEMENTATION },
      capabilities,
      routes,
    } satisfies ModelDefinition
  }),
)

/** Explicit source configuration for automatic caching; never a factory default. */
export const openaiConfiguration = Object.freeze({
  revision: '1',
  values: Object.freeze({ cache: Object.freeze({ mode: 'automatic' }) }),
}) satisfies ModelAdaptationBinding['configuration']
