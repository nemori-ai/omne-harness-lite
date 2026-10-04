import type { ModelAdaptationBinding } from '@omne-harness-lite/model-profile'
import { ownDefinitions, type ModelDefinition, type ModelRoute } from '../definitions.ts'

// Shared route policy; the two narrow effort rules live with their model routes.
const common = {
  reminderRole: 'user',
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
  cache: { mode: 'automatic' },
} as const

// Moonshot's OpenRouter routes cache repeated prefixes without manual controls.
// The small supplied parameter subset avoids promising unverified numeric ranges.
export const kimiK3MoonshotRoute = {
  ...common,
  parameters: {
    ...common.parameters,
    reasoningEffort: {
      kind: 'select',
      accepted: { values: ['low', 'high', 'max'] },
      otherwise: { drop: true },
    },
  },
} satisfies ModelRoute

// K2.7 Code's thinking mode is always enabled; the unified effort is not a
// supported request knob on this route, so an explicit effort is left traceable.
export const kimiK27CodeMoonshotRoute = {
  ...common,
  parameters: { ...common.parameters, reasoningEffort: { kind: 'drop' } },
} satisfies ModelRoute

/** Exact model ID → provider ID → shared route policy; no prefix or provider fallback. */
export const moonshotModelRoutes = {
  'moonshotai/kimi-k3': { 'moonshotai/mxfp4': kimiK3MoonshotRoute },
  'moonshotai/kimi-k2.7-code': { 'moonshotai/int4': kimiK27CodeMoonshotRoute },
} as const satisfies Readonly<Record<string, Readonly<Record<string, ModelRoute>>>>

// The selected OpenRouter endpoints report shared context windows and maximum
// completion sizes, but no independent max_prompt_tokens value. These project
// input caps reserve each route's full reported completion budget. Their source
// facts remain unknown, not an assertion that the upstream input is unbounded.
const unknownImageInputLimits = {
  maxInputTokens: { status: 'unknown' },
  maxRequestBytes: { status: 'unknown' },
  maxImageBytes: { status: 'unknown' },
  maxImages: { status: 'unknown' },
} as const

/** Complete MP4 declarations for the selected Moonshot OpenRouter endpoints. */
export const moonshotDefinitions = ownDefinitions([
  {
    modelId: 'moonshotai/kimi-k3',
    revision: '3',
    implementation: { name: 'pi-ai:moonshot', revision: 'mp4-19' },
    capabilities: {
      inputModalities: ['image', 'text', 'video'],
      outputModalities: ['text'],
      maxInputTokens: 104858,
      maxOutputTokens: 943718,
      inputConstraints: { maxImageBytes: 4194304 },
      upstreamInputLimits: unknownImageInputLimits,
    },
    routes: moonshotModelRoutes['moonshotai/kimi-k3'],
  },
  {
    modelId: 'moonshotai/kimi-k2.7-code',
    revision: '3',
    implementation: { name: 'pi-ai:moonshot', revision: 'mp4-19' },
    capabilities: {
      inputModalities: ['image', 'text'],
      outputModalities: ['text'],
      maxInputTokens: 26215,
      maxOutputTokens: 235929,
      inputConstraints: { maxImageBytes: 4194304 },
      upstreamInputLimits: unknownImageInputLimits,
    },
    routes: moonshotModelRoutes['moonshotai/kimi-k2.7-code'],
  },
] satisfies readonly ModelDefinition[])

/** An explicit source configuration; no request or registration installs it by default. */
export const moonshotAutomaticConfiguration = Object.freeze({
  revision: '1',
  values: Object.freeze({ cache: Object.freeze({ mode: 'automatic' }) }),
}) satisfies ModelAdaptationBinding['configuration']
