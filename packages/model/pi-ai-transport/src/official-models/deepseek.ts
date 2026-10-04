import type { ModelAdaptationBinding } from '@omne-harness-lite/model-profile'
import { ownDefinitions, type ModelDefinition, type ModelRoute } from '../definitions.ts'

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

// V4.1 Flash uses the same supplied DeepInfra request policy. Automatic means
// no manual cache controls; a cache hit needs separate evidence.
export const deepseekV41FlashDeepInfraRoute = automaticDeepInfraRoute

/** Exact model ID → provider ID → shared route policy; no prefix or provider fallback. */
export const deepseekModelRoutes = {
  'deepseek/deepseek-v4.1-flash': { 'deepinfra/fp8': deepseekV41FlashDeepInfraRoute },
  'deepseek/deepseek-v4-pro-0813': { 'deepinfra/fp8': automaticDeepInfraRoute },
} as const satisfies Readonly<Record<string, Readonly<Record<string, ModelRoute>>>>

// The selected DeepInfra endpoint reports no independent max_prompt_tokens.
// Both project input caps reserve the selected endpoint's full output allowance
// from its shared context window; neither cap is an upstream input-limit fact.
// Source: official-definition-inputs.json, rows 16–17 (archived endpoint bodies).
export const deepseekDefinitions = ownDefinitions([
  {
    modelId: 'deepseek/deepseek-v4.1-flash',
    revision: '5',
    implementation: { name: 'pi-ai:deepseek', revision: 'mp4-19' },
    capabilities: {
      inputModalities: ['image', 'text'],
      outputModalities: ['text'],
      maxInputTokens: 917504,
      maxOutputTokens: 131072,
      inputConstraints: { maxImageBytes: 4194304 },
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
        maxImageBytes: { status: 'unknown' },
        maxImages: { status: 'unknown' },
      },
    },
    routes: deepseekModelRoutes['deepseek/deepseek-v4.1-flash'],
  },
  {
    modelId: 'deepseek/deepseek-v4-pro-0813',
    revision: '6',
    implementation: { name: 'pi-ai:deepseek', revision: 'mp4-19' },
    capabilities: {
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 1032192,
      maxOutputTokens: 16384,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
    },
    routes: deepseekModelRoutes['deepseek/deepseek-v4-pro-0813'],
  },
] satisfies readonly ModelDefinition[])

const flashDefinition = deepseekDefinitions[0]
const proDefinition = deepseekDefinitions[1]
if (!flashDefinition || !proDefinition) throw new TypeError('missing official DeepSeek definition')

/** Complete Flash leaf; actual model/provider send certification is separate. */
export const deepseekV41FlashDefinition = flashDefinition
/** Complete Pro leaf; actual route certification is separate. */
export const deepseekV4Pro0813Definition = proDefinition

/** Explicit source configuration; no factory installs it as a hidden default. */
const automaticConfiguration = Object.freeze({
  revision: '1',
  values: Object.freeze({ cache: Object.freeze({ mode: 'automatic' }) }),
}) satisfies ModelAdaptationBinding['configuration']

export const deepseekV41FlashConfiguration = automaticConfiguration
export const deepseekV4Pro0813Configuration = automaticConfiguration
