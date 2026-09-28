import type { ModelRoute } from '../definitions.ts'

// These are route policies, not complete official profiles. The confirmed image,
// audio and video inputs still need bounded project limits in the successor spec.
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
