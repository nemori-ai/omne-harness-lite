import type { ModelRoute } from '../definitions.ts'

// Family route policies only; complete definitions use the same shared validator as DeepSeek.
// These are route rules, not complete official model definitions. In particular,
// neither image input limits nor the K3 video input path have been certified.
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
