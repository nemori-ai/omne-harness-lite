import { ownDefinitions, type ModelDefinition, type ModelRoute } from '../definitions.ts'

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

// Explicit names keep each model's selected route inspectable.
export const claudeOpus55AnthropicRoute = common
export const claudeOpus5AnthropicRoute = common
export const claudeSonnet5AnthropicRoute = common
export const claudeFable51AnthropicRoute = common

/** Exact model ID → provider ID → shared route policy; no prefix or provider fallback. */
export const anthropicModelRoutes = {
  'anthropic/claude-opus-5.5': { anthropic: claudeOpus55AnthropicRoute },
  'anthropic/claude-opus-5': { anthropic: claudeOpus5AnthropicRoute },
  'anthropic/claude-sonnet-5': { anthropic: claudeSonnet5AnthropicRoute },
  'anthropic/claude-fable-5.1': { anthropic: claudeFable51AnthropicRoute },
} as const satisfies Readonly<Record<string, Readonly<Record<string, ModelRoute>>>>

// Selected Anthropic endpoints report a shared 1,000,000-token window and
// 128,000-token output ceiling. The project's input cap reserves that entire
// output capacity. No independent upstream input or media limit was reported;
// the project therefore supplies its own finite per-image cap while retaining
// each upstream fact as unknown. See the 2026-09-28 Anthropic route report.
const capabilities = {
  inputModalities: ['image', 'text'],
  outputModalities: ['text'],
  maxInputTokens: 872000,
  maxOutputTokens: 128000,
  inputConstraints: { maxImageBytes: 4194304 },
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
    maxImageBytes: { status: 'unknown' },
    maxImages: { status: 'unknown' },
  },
} as const

/** Four complete official declarations; the shared reader owns and validates every value. */
export const anthropicDefinitions = ownDefinitions([
  {
    modelId: 'anthropic/claude-opus-5.5',
    revision: '2',
    implementation: { name: 'pi-ai:anthropic', revision: 'mp4-5' },
    capabilities,
    routes: anthropicModelRoutes['anthropic/claude-opus-5.5'],
  },
  {
    modelId: 'anthropic/claude-opus-5',
    revision: '2',
    implementation: { name: 'pi-ai:anthropic', revision: 'mp4-5' },
    capabilities,
    routes: anthropicModelRoutes['anthropic/claude-opus-5'],
  },
  {
    modelId: 'anthropic/claude-sonnet-5',
    revision: '2',
    implementation: { name: 'pi-ai:anthropic', revision: 'mp4-5' },
    capabilities,
    routes: anthropicModelRoutes['anthropic/claude-sonnet-5'],
  },
  {
    modelId: 'anthropic/claude-fable-5.1',
    revision: '2',
    implementation: { name: 'pi-ai:anthropic', revision: 'mp4-5' },
    capabilities,
    routes: anthropicModelRoutes['anthropic/claude-fable-5.1'],
  },
] satisfies readonly ModelDefinition[])
