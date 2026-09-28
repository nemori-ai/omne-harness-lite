import type { ModelAdaptationBinding } from '@omne-harness-lite/model-profile'
import { readModelDefinition, type ModelDefinition, type ModelRoute } from '../definitions.ts'

// Family route policies: shared by model-specific declarations below.
// A declared supplied subset, not a claim that DeepInfra lacks the dropped parameters.
// Native sampling conditions do not establish DeepInfra's conditional behavior.
const automaticDeepInfraRoute = {
  reminderRole: 'user',
  parameters: {
    reasoningEffort: {
      kind: 'select',
      accepted: { values: ['low'] },
      otherwise: { drop: true },
    },
    temperature: { kind: 'drop' },
    topP: { kind: 'drop' },
    seed: {
      kind: 'select',
      accepted: { values: [0] },
      otherwise: { drop: true },
    },
    // D082/G22 requires original output requests; no metadata-derived clamping.
    maxOutputTokens: { kind: 'pass' },
    stopSequences: {
      kind: 'select',
      accepted: { values: [['END']] },
      otherwise: { drop: true },
    },
    frequencyPenalty: { kind: 'drop' },
    presencePenalty: { kind: 'drop' },
  },
  extra: {},
  cache: { mode: 'automatic' },
} satisfies ModelRoute

// V4.1 Flash uses this same supplied DeepInfra request policy. Its known image
// modality cannot yet be published as a complete official definition: profile3
// would interpret the unknown route-specific image limit as no upstream limit.
// Automatic means no manual cache controls; a cache hit needs separate evidence.
export const deepseekV41FlashDeepInfraRoute = automaticDeepInfraRoute

/** Exact model ID → provider ID → shared route policy; no prefix or provider fallback. */
export const deepseekModelRoutes = {
  'deepseek/deepseek-v4.1-flash': { 'deepinfra/fp8': deepseekV41FlashDeepInfraRoute },
  'deepseek/deepseek-v4-pro-0813': { 'deepinfra/fp8': automaticDeepInfraRoute },
} as const satisfies Readonly<Record<string, Readonly<Record<string, ModelRoute>>>>

// Complete Pro definition: capabilities and exact revisions use the common validator.
const declaration = {
  modelId: 'deepseek/deepseek-v4-pro-0813',
  revision: '1',
  implementation: { name: 'pi-ai:deepseek', revision: 'd095-1' },
  capabilities: {
    inputModalities: ['text'],
    outputModalities: ['text'],
    // Shared route window 1048576, reserving its complete 16384 output capacity.
    // This is the S8 input-only budget, not an upstream max_prompt_tokens value.
    maxInputTokens: 1032192,
    maxOutputTokens: 16384,
    // No active image constraint in this model's confirmed text-only declaration.
    inputConstraints: {},
  },
  routes: deepseekModelRoutes['deepseek/deepseek-v4-pro-0813'],
} satisfies ModelDefinition

// The same public boundary owns and validates every nested declaration value.
const owned = readModelDefinition([declaration], {
  implementation: declaration.implementation,
  definition: { modelId: declaration.modelId, revision: declaration.revision },
})
if ('rejected' in owned) throw new TypeError('invalid official DeepSeek definition')

/** One explicit official leaf; registration and provider selection remain caller-owned. */
export const deepseekV4Pro0813Definition = owned.ok

/** An explicit source configuration; no factory installs it as a hidden default. */
export const deepseekV4Pro0813Configuration = Object.freeze({
  revision: '1',
  values: Object.freeze({ cache: Object.freeze({ mode: 'automatic' }) }),
}) satisfies ModelAdaptationBinding['configuration']
