import type { ModelRoute } from '../definitions.ts'

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
