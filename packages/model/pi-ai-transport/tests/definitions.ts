import type { ModelDefinition, ParameterRules } from '@omne-harness-lite/pi-ai-transport'
export const fixtureRules: ParameterRules = {
  reasoningEffort: {
    kind: 'select',
    accepted: { values: ['none', 'low', 'medium', 'high'] },
    otherwise: { drop: true },
  },
  temperature: { kind: 'pass' },
  topP: { kind: 'pass' },
  seed: { kind: 'pass' },
  maxOutputTokens: { kind: 'pass' },
  stopSequences: { kind: 'pass' },
  frequencyPenalty: { kind: 'pass' },
  presencePenalty: { kind: 'pass' },
}
const extra = Object.fromEntries(
  [
    'metadata',
    'nested',
    'private_zero',
    'private_false',
    'private_null',
    'private_text',
    'private_array',
    'private_object',
    'private_nested',
    'private_flag',
  ].map(key => [key, { kind: 'pass' as const }]),
)
/** Synthetic capability/rule facts: never use these to call or publish a live model. */
export const testDefinitions: readonly ModelDefinition[] = [
  {
    modelId: 'fixture/text-automatic',
    revision: 'fixture-1',
    implementation: { name: 'fixture:openrouter-text', revision: '7' },
    capabilities: {
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      maxInputTokens: 128000,
      maxOutputTokens: 4096,
      inputConstraints: { maxImageBytes: 4194304 },
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
        maxImageBytes: { status: 'unknown' },
        maxImages: { status: 'unknown' },
      },
    },
    routes: {
      openai: {
        reminderRole: 'developer',
        parameters: fixtureRules,
        extra,
        cache: { mode: 'automatic' },
      },
    },
  },
  {
    modelId: 'fixture/text-explicit',
    revision: 'fixture-1',
    implementation: { name: 'fixture:openrouter-text', revision: '7' },
    capabilities: {
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      maxInputTokens: 128000,
      maxOutputTokens: 4096,
      inputConstraints: { maxImageBytes: 4194304 },
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
        maxImageBytes: { status: 'unknown' },
        maxImages: { status: 'unknown' },
      },
    },
    routes: {
      anthropic: {
        reminderRole: 'user',
        parameters: fixtureRules,
        extra,
        cache: {
          mode: 'explicit',
          ttlValues: ['5m', '1h'],
          breakpointLayouts: [['system'], ['system', 'last_tool', 'last_message']],
        },
      },
    },
  },
]
