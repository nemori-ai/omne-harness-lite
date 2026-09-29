import type { ModelAdaptationBinding } from '@omne-harness-lite/model-profile'

// Private, fixed contribution rules. This is not an upstream model-name heuristic.
export const openAiProBindings: Readonly<
  Record<
    string,
    {
      readonly revision: string
      readonly previousRevision: string
      readonly previousImplementation: string
    }
  >
> = Object.freeze({
  'openai/gpt-6-astra-pro': {
    revision: '2',
    previousRevision: '1',
    previousImplementation: 'mp4-1',
  },
  'openai/gpt-6-sol-pro': { revision: '2', previousRevision: '1', previousImplementation: 'mp4-1' },
  'openai/gpt-6-luna-pro': {
    revision: '2',
    previousRevision: '1',
    previousImplementation: 'mp4-1',
  },
  'openai/gpt-5.6-sol-pro': {
    revision: '6',
    previousRevision: '4',
    previousImplementation: 'mp4-5',
  },
  'openai/gpt-5.6-terra-pro': {
    revision: '6',
    previousRevision: '4',
    previousImplementation: 'mp4-5',
  },
  'openai/gpt-5.6-luna-pro': {
    revision: '6',
    previousRevision: '4',
    previousImplementation: 'mp4-5',
  },
})
export const PRO_IMPLEMENTATION_REVISION = 'mp4-13'
export const PRO_TRANSFORM_REVISION = 'openrouter-input-transform/pro-scope-1'
export const READER_REVISION = 'openrouter-usage-reader/2'
export const PRO_READER_REVISION = 'openrouter-usage-reader/3-openai-pro-scope'
export type UsageScope = 'inherited_context_total' | 'scope_unknown'

/** Other trusted whole contributions retain their existing reader contract;
 * this does not newly certify their upstream statistics. Previous exact Pro
 * coordinates exist solely for already captured groups under registry retirement.
 * The current official table/factory does not offer those old contributions.
 */
export function usageScope(
  model: string,
  provider: string,
  binding: ModelAdaptationBinding,
): UsageScope {
  const rule = Object.hasOwn(openAiProBindings, model) ? openAiProBindings[model] : undefined
  if (!rule) return 'inherited_context_total'
  const values = binding.configuration.values
  const cache = values.cache
  const oldConfiguration =
    Object.keys(values).length === 1 &&
    cache !== null &&
    typeof cache === 'object' &&
    !Array.isArray(cache) &&
    Object.keys(cache).length === 1 &&
    'mode' in cache &&
    cache.mode === 'automatic'
  return provider === 'openai' &&
    binding.definition.modelId === model &&
    binding.definition.revision === rule.previousRevision &&
    binding.implementation.name === 'pi-ai:openai' &&
    binding.implementation.revision === rule.previousImplementation &&
    oldConfiguration
    ? 'inherited_context_total'
    : 'scope_unknown'
}
export function readerRevision(scope: UsageScope): string {
  return scope === 'scope_unknown' ? PRO_READER_REVISION : READER_REVISION
}
