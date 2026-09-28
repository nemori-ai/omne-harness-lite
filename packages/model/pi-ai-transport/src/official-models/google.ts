import { ownDefinitions, type ModelDefinition, type ModelRoute } from '../definitions.ts'

// The supplied parameter subset is deliberately narrow; a drop does not assert
// that Google or OpenRouter cannot accept that parameter through another API.
const flashRoute = {
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
  // Gemini 3.7/3.8 Flash implicit caching needs no manual cache_control.
  cache: { mode: 'automatic' },
} satisfies ModelRoute

// Keep provider slugs explicit. One cache configuration works on both selected
// routes; neither definition relies on OpenRouter's automatic provider fallback.
export const gemini38FlashRoutes = {
  'google-ai-studio': flashRoute,
  'google-vertex': flashRoute,
} satisfies Readonly<Record<string, ModelRoute>>

export const gemini37FlashRoutes = {
  'google-ai-studio': flashRoute,
  'google-vertex': flashRoute,
} satisfies Readonly<Record<string, ModelRoute>>

/** Exact model ID → provider ID → shared route policy; no prefix or provider fallback. */
export const googleModelRoutes = {
  'google/gemini-3.8-flash': gemini38FlashRoutes,
  'google/gemini-3.7-flash': gemini37FlashRoutes,
} as const satisfies Readonly<Record<string, Readonly<Record<string, ModelRoute>>>>

// Both selected Google AI Studio endpoints report the same 1,048,576-token
// shared window and 65,536-token full output capacity. The project reserves
// that full output before offering 983,040 input tokens. Neither endpoint
// reports an independent max_prompt_tokens value: this project cap must not
// be presented as a known upstream input-only limit. See the frozen endpoint
// inventory and 2026-09-28 Google Flash route report.
const flashCapabilities = {
  inputModalities: ['audio', 'image', 'text', 'video'],
  outputModalities: ['text'],
  maxInputTokens: 983040,
  maxOutputTokens: 65536,
  inputConstraints: { maxImageBytes: 4194304 },
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
    maxImageBytes: { status: 'unknown' },
    maxImages: { status: 'unknown' },
  },
} as const

/** Complete declarations for the selected Google AI Studio endpoints. */
export const googleDefinitions = ownDefinitions([
  {
    modelId: 'google/gemini-3.8-flash',
    revision: '1',
    implementation: { name: 'pi-ai:google', revision: 'mp4-1' },
    capabilities: flashCapabilities,
    routes: {
      'google-ai-studio': googleModelRoutes['google/gemini-3.8-flash']['google-ai-studio'],
    },
  },
  {
    modelId: 'google/gemini-3.7-flash',
    revision: '1',
    implementation: { name: 'pi-ai:google', revision: 'mp4-1' },
    capabilities: flashCapabilities,
    routes: {
      'google-ai-studio': googleModelRoutes['google/gemini-3.7-flash']['google-ai-studio'],
    },
  },
] satisfies readonly ModelDefinition[])
