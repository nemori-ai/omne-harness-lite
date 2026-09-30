import { ownDefinitions, type ModelDefinition, type ModelRoute } from '../definitions.ts'

// The xai endpoint of both confirmed Grok models uses this deliberately bounded
// supplied subset. Dropped sampling fields are not claims of upstream absence.
// The upstream xhigh effort has no value in the accepted unified five-value domain;
// max is not translated to xhigh because that would silently change its meaning.
const xaiReasoningRoute = {
  reminderRole: 'user',
  parameters: {
    reasoningEffort: {
      kind: 'select',
      accepted: { values: ['low', 'medium', 'high'] },
      otherwise: { drop: true },
    },
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
} satisfies ModelRoute

// Both names are explicit so an adopted per-model definition can bind its own
// revision without deriving route behavior from a model-id prefix.
export const grok47XaiRoute = xaiReasoningRoute
export const grok46XaiRoute = xaiReasoningRoute

/** Exact model ID → provider ID → shared route policy; no prefix or provider fallback. */
export const xaiModelRoutes = {
  'x-ai/grok-4.7': { xai: grok47XaiRoute },
  'x-ai/grok-4.6': { xai: grok46XaiRoute },
} as const satisfies Readonly<Record<string, Readonly<Record<string, ModelRoute>>>>

// The selected OpenRouter xai endpoints each report a 500000-token shared
// window and a 450000-token maximum completion. Reserve that full completion
// capacity for the project input cap; the endpoint does not report an
// independent input-token limit. Native xAI image limits are not route facts.
// Source: research/model-request-adaptation/reports/2026-09-28-xai-grok-routes.md
const grokCapabilities = {
  inputModalities: ['image', 'text'],
  outputModalities: ['text'],
  maxInputTokens: 50000,
  maxOutputTokens: 450000,
  inputConstraints: { maxImageBytes: 4194304 },
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
    maxImageBytes: { status: 'unknown' },
    maxImages: { status: 'unknown' },
  },
} as const satisfies ModelDefinition['capabilities']

/** Complete MP4 declarations; registration and actual send certification remain separate. */
export const xaiDefinitions = ownDefinitions([
  {
    modelId: 'x-ai/grok-4.7',
    revision: '5',
    implementation: { name: 'pi-ai:xai', revision: 'mp4-20' },
    capabilities: grokCapabilities,
    routes: xaiModelRoutes['x-ai/grok-4.7'],
  },
  {
    modelId: 'x-ai/grok-4.6',
    revision: '5',
    implementation: { name: 'pi-ai:xai', revision: 'mp4-20' },
    capabilities: grokCapabilities,
    routes: xaiModelRoutes['x-ai/grok-4.6'],
  },
])
