import type { ModelRoute } from '../definitions.ts'

// Route rules only. The currently accepted profile cannot publish an unknown
// image/video bound as a complete official definition for the multimodal leaves.
// Dropped parameters are outside this supplied subset, not upstream negatives.
const zAiFp8Common = {
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

const published53Efforts = {
  kind: 'select',
  accepted: { values: ['low', 'high', 'max'] },
  otherwise: { drop: true },
} as const

/** GLM 5.3 on the observed Z.AI fp8 route; no implicit effort is inserted. */
export const glm53ZAiFp8Route = {
  ...zAiFp8Common,
  parameters: { ...zAiFp8Common.parameters, reasoningEffort: published53Efforts },
} satisfies ModelRoute

// Prime's observed Alibaba warm read used a per-message cache breakpoint.
// The captured read did not prove that a requested TTL was honored. No
// complete definition or production configuration is published.
export const glm53PrimeAlibabaRoute = {
  ...zAiFp8Common,
  parameters: { ...zAiFp8Common.parameters, reasoningEffort: published53Efforts },
  cache: { mode: 'explicit', ttlValues: ['5m'], breakpointLayouts: [['last_message']] },
} satisfies ModelRoute

// The public model descriptions do not establish a precise effort subset for
// these selected fp8 endpoints. An explicit effort is therefore traceably
// omitted instead of being silently passed through or assigned a default.
const fp8UnverifiedEffort = {
  ...zAiFp8Common,
  parameters: { ...zAiFp8Common.parameters, reasoningEffort: { kind: 'drop' } },
} satisfies ModelRoute

export const glm53FlashZAiFp8Route = fp8UnverifiedEffort
export const glm53FlashxZAiFp8Route = fp8UnverifiedEffort

// The upstream GLM 5.2 description names high and xhigh; xhigh is outside
// the accepted unified vocabulary. Only the exact shared "high" is supplied.
export const glm52ZAiFp8Route = {
  ...zAiFp8Common,
  parameters: {
    ...zAiFp8Common.parameters,
    reasoningEffort: {
      kind: 'select',
      accepted: { values: ['high'] },
      otherwise: { drop: true },
    },
  },
} satisfies ModelRoute
