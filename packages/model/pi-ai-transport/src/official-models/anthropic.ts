import type { ModelRoute } from '../definitions.ts'

// Supplied OpenRouter/Anthropic subset for the four confirmed Claude routes.
// The directory lists more parameters, but their combinations and numeric
// ranges have not been certified. A dropped value remains visible to callers.
const common = {
  reminderRole: 'user',
  parameters: {
    reasoningEffort: {
      kind: 'select',
      accepted: { values: ['low', 'medium', 'high', 'max'] },
      otherwise: { drop: true },
    },
    temperature: { kind: 'drop' },
    topP: { kind: 'drop' },
    seed: { kind: 'drop' },
    maxOutputTokens: { kind: 'pass' },
    stopSequences: { kind: 'pass' },
    frequencyPenalty: { kind: 'drop' },
    presencePenalty: { kind: 'drop' },
  },
  extra: {},
  // OpenRouter documents 1h as a literal TTL on per-block cache_control.
  // Its 5m form omits ttl, which needs a separate shared wire mapping.
  // The only declared breakpoint is the trailing message text block, which
  // has a direct Chat Completions example and no optional attachment target.
  cache: {
    mode: 'explicit',
    ttlValues: ['1h'],
    breakpointLayouts: [['last_message']],
  },
} satisfies ModelRoute

// Explicit names keep each model's route inspectable without publishing
// incomplete ModelDefinitions or silently narrowing known image/file input.
export const claudeOpus55AnthropicRoute = common
export const claudeOpus5AnthropicRoute = common
export const claudeSonnet5AnthropicRoute = common
export const claudeFable51AnthropicRoute = common
