import type { ModelRoute } from '../definitions.ts'

// These are route rules, not complete official definitions. OpenAI model pages
// and the selected OpenRouter endpoint have not established complete image
// constraints or all conditional parameter domains for any of the 12 profiles.
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
