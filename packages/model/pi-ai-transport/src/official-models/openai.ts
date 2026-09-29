import { openAiProBindings, PRO_IMPLEMENTATION_REVISION } from '../usage-scope.ts'
import type { ModelAdaptationBinding } from '@omne-harness-lite/model-profile'
import { ownDefinitions, type ModelDefinition, type ModelRoute } from '../definitions.ts'

// These rules cover the supplied route behavior; parameter drops do not claim
// that the upstream models lack those parameters. Route certification is separate.
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

/** Exact model ID → provider ID → shared route policy; no prefix or provider fallback. */
export const openaiModelRoutes = {
  'openai/gpt-6-astra': { openai: openaiRoutes['openai/gpt-6-astra'] },
  'openai/gpt-6-astra-pro': { openai: openaiRoutes['openai/gpt-6-astra-pro'] },
  'openai/gpt-6-sol': { openai: openaiRoutes['openai/gpt-6-sol'] },
  'openai/gpt-6-sol-pro': { openai: openaiRoutes['openai/gpt-6-sol-pro'] },
  'openai/gpt-6-luna': { openai: openaiRoutes['openai/gpt-6-luna'] },
  'openai/gpt-6-luna-pro': { openai: openaiRoutes['openai/gpt-6-luna-pro'] },
  'openai/gpt-5.6-sol': { openai: openaiRoutes['openai/gpt-5.6-sol'] },
  'openai/gpt-5.6-sol-pro': { openai: openaiRoutes['openai/gpt-5.6-sol-pro'] },
  'openai/gpt-5.6-terra': { openai: openaiRoutes['openai/gpt-5.6-terra'] },
  'openai/gpt-5.6-terra-pro': { openai: openaiRoutes['openai/gpt-5.6-terra-pro'] },
  'openai/gpt-5.6-luna': { openai: openaiRoutes['openai/gpt-5.6-luna'] },
  'openai/gpt-5.6-luna-pro': { openai: openaiRoutes['openai/gpt-5.6-luna-pro'] },
} as const satisfies Readonly<Record<string, Readonly<Record<string, ModelRoute>>>>

// Source: .meta_harness/research/model-request-adaptation/reports/
// 2026-09-28-openai-twelve-route-facts.md and its archived endpoint bodies.
// All 12 selected OpenAI endpoints report the same 1,050,000-token shared
// window, 922,000-token max prompt, and 128,000-token max completion. Reserve
// the complete output capacity when setting the project's input-only cap.
// The 4 MiB decoded-image cap is this project's explicit offering; selected
// endpoint metadata does not establish a per-image upstream byte limit.
const capabilities = {
  inputModalities: ['image', 'text'],
  outputModalities: ['text'],
  maxInputTokens: 922000,
  maxOutputTokens: 128000,
  inputConstraints: { maxImageBytes: 4194304 },
  upstreamInputLimits: {
    maxInputTokens: { status: 'limited', value: 922000 },
    maxRequestBytes: { status: 'unknown' },
    maxImageBytes: { status: 'unknown' },
    maxImages: { status: 'unknown' },
  },
} as const satisfies ModelDefinition['capabilities']

const gpt56MeteredIds = new Set([
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-sol-pro',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-terra-pro',
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-luna-pro',
])

/** Narrow successors adopting the common final-visible-JSON surrogate.
 * These successors replace earlier unmetered or narrower metered declarations; no old binding alias.
 * Applicability inputs (2026-09-29): vendor-continuation/openai/{research.md,
 * initial-observations.json}; https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/gpt-6
 * and https://developers.openai.com/api/docs/guides/reasoning . Native OpenAI
 * Astra Chat function calling is unavailable; OpenRouter translation/tool support
 * still needs route certification. Counting visible tools is not that certification.
 */
export const openaiFinalVisibleBindings: Readonly<
  Record<
    string,
    {
      readonly revision: string
      readonly implementationRevision: string
      readonly efforts: readonly string[]
      readonly algorithmRevision: string
      readonly evidence: string
    }
  >
> = Object.freeze({
  'openai/gpt-6-sol': Object.freeze({
    revision: '5',
    implementationRevision: 'mp4-17',
    efforts: other.parameters.reasoningEffort.accepted.values,
    algorithmRevision: 'openai-gpt-6-sol-final-visible-json-image-proxy-2',
    evidence:
      'OpenRouter/OpenAI Sol low-effort finite image holdout 2026-09-29: 65x65/1024x1024/2049x2903 observed complete input 21/1239/7109; native 32px patches times 1.2 plus final visible o200k JSON remains an estimated proxy, not a private tokenizer/preprocessing fact or error bound. Omitted/auto detail only; no fitted residual or imported resize/patch cap. See research/openai-sol-luna-image-estimation.',
  }),
  'openai/gpt-6-luna': Object.freeze({
    revision: '6',
    implementationRevision: 'mp4-17',
    efforts: other.parameters.reasoningEffort.accepted.values,
    algorithmRevision: 'openai-gpt-6-luna-final-visible-json-image-proxy-2',
    evidence:
      'OpenRouter/OpenAI Sol/Luna finite image study 2026-09-29 supports an estimated native 32px/1.2 visual proxy with final visible o200k JSON; omitted/auto detail only, no fitted residual or imported resize/patch cap. Both base routes observed complete input 21/1239/7109 on 65x65/1024x1024/2049x2903; Pro pair requests completed but billing input 1431 has unknown context scope, so it is not an accuracy observation. Exact same-base Pro mode is an applicability inference, not a private preprocessing guarantee. See research/openai-sol-luna-image-estimation.',
  }),
  'openai/gpt-6-astra': Object.freeze({
    revision: '4',
    implementationRevision: 'mp4-17',
    efforts: astra.parameters.reasoningEffort.accepted.values,
    algorithmRevision: 'openai-gpt-6-astra-final-visible-json-o200k-patches-1',
    evidence:
      'OpenRouter OpenAI GPT-6 Astra own low-effort baseline (2026-09-28): text o200k surrogate 25, actual prompt_tokens 39; OpenRouter GPT-6 migration guide (2026-09-29) establishes shared Chat API and Astra effort domain; full final visible JSON framing/tools/controls is an estimated applicability inference, not model tokenizer identity, fitted +14 overhead, error bound, or completed multi-turn/effort certification; archived OpenAI images-vision guide (2026-09-28), image-doc.md SHA256 4936284cccfc38f22281d6a698b6f190ccc857849ea8dc533ed68617984b608d: Astra 32px patches times 1.2, low 512px, high 65535px/2500 patches, original/auto 65535px and reject above 30000 processed patches; actual provider preprocessing remains estimated',
  }),
  'openai/gpt-6-astra-pro': Object.freeze({
    revision: '5',
    implementationRevision: 'mp4-17',
    efforts: astra.parameters.reasoningEffort.accepted.values,
    algorithmRevision: 'openai-gpt-6-astra-pro-final-visible-json-o200k-image-proxy-1',
    evidence:
      'OpenRouter GPT-6 migration guide and OpenAI reasoning guide (2026-09-29): astra Pro is the corresponding base model in pro mode, mode and effort independent; same visible Chat protocol supports o200k final-JSON applicability inference only. Own low-effort baseline: text proxy 27, billed prompt_tokens 1561; billed scope unconfirmed, never used as context calibration or fitted overhead. Real context error, private framing and full route/tool/effort certification remain unknown; published Astra base vision patch rules reused as an estimated image proxy from the exact same-base Pro mode relationship, not verified Pro preprocessing; input usage scope stays unknown',
  }),
  'openai/gpt-6-sol-pro': Object.freeze({
    revision: '5',
    implementationRevision: 'mp4-17',
    efforts: other.parameters.reasoningEffort.accepted.values,
    algorithmRevision: 'openai-gpt-6-sol-pro-final-visible-json-image-proxy-2',
    evidence:
      'OpenRouter/OpenAI Sol/Luna finite image study 2026-09-29 supports an estimated native 32px/1.2 visual proxy with final visible o200k JSON; omitted/auto detail only, no fitted residual or imported resize/patch cap. Both base routes observed complete input 21/1239/7109 on 65x65/1024x1024/2049x2903; Pro pair requests completed but billing input 1431 has unknown context scope, so it is not an accuracy observation. Exact same-base Pro mode is an applicability inference, not a private preprocessing guarantee. See research/openai-sol-luna-image-estimation.',
  }),
  'openai/gpt-6-luna-pro': Object.freeze({
    revision: '5',
    implementationRevision: 'mp4-17',
    efforts: other.parameters.reasoningEffort.accepted.values,
    algorithmRevision: 'openai-gpt-6-luna-pro-final-visible-json-image-proxy-2',
    evidence:
      'OpenRouter/OpenAI Sol/Luna finite image study 2026-09-29 supports an estimated native 32px/1.2 visual proxy with final visible o200k JSON; omitted/auto detail only, no fitted residual or imported resize/patch cap. Both base routes observed complete input 21/1239/7109 on 65x65/1024x1024/2049x2903; Pro pair requests completed but billing input 1431 has unknown context scope, so it is not an accuracy observation. Exact same-base Pro mode is an applicability inference, not a private preprocessing guarantee. See research/openai-sol-luna-image-estimation.',
  }),
})

/** Complete MP4 declarations for the exact 12 selected OpenAI routes. */
export const openaiDefinitions = ownDefinitions(
  Object.entries(openaiModelRoutes).map(
    ([modelId, routes]) =>
      ({
        modelId,
        revision:
          openaiFinalVisibleBindings[modelId]?.revision ??
          openAiProBindings[modelId]?.revision ??
          (gpt56MeteredIds.has(modelId) ? '8' : '1'),
        implementation: {
          name: 'pi-ai:openai',
          revision:
            openaiFinalVisibleBindings[modelId]?.implementationRevision ??
            (openAiProBindings[modelId]
              ? PRO_IMPLEMENTATION_REVISION
              : gpt56MeteredIds.has(modelId)
                ? 'mp4-17'
                : 'mp4-1'),
        },
        capabilities,
        routes,
      }) satisfies ModelDefinition,
  ),
)

/** Explicit source configuration for automatic caching; never a factory default. */
export const openaiConfiguration = Object.freeze({
  revision: '1',
  values: Object.freeze({ cache: Object.freeze({ mode: 'automatic' }) }),
}) satisfies ModelAdaptationBinding['configuration']
