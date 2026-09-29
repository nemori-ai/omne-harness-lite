import { isNonNegativeJsonInteger, type JsonObject } from '@omne-harness-lite/content-blocks'
import type { CountingBasis } from '@omne-harness-lite/model-response'
import type { OriginalBasisApplies } from '../meter-transform.ts'
import type { ImageRule } from './openai-images.ts'
import { object } from '../json.ts'
import { INPUT_PROJECTION_REVISION } from '../projection.ts'

export const OPENAI_FAMILY_IMPLEMENTATION = 'mp4-18'
export const OPENAI_FAMILY_ALGORITHM = 'openai-visible-json-complete-output-group-estimated/1'
export const OPENAI_FAMILY_REPLAY = 'openai-complete-output-group-workload-estimated/1'
export const OPENAI_FAMILY_EVIDENCE =
  'D107 priority-family provider revision 5 (2026-09-29): complete unchanged same-model OpenRouter/OpenAI output groups use upstream O once as a workload-related estimated proxy with zero experimental net framing correction; not exact input occupancy or an upper bound, no GPT6 all_turns claim. Pro input usage scope stays unknown. Visible o200k/image rules retain their declared surrogate limits.'
const standardEfforts = Object.freeze(['none', 'low', 'medium', 'high', 'max'])
const astraEfforts = Object.freeze(['low', 'medium', 'high', 'max'])
export interface OpenAiOriginalRecord {
  readonly definitionRevision: string
  readonly implementationRevision: string
  readonly algorithmRevision: string
  readonly tokenizerRevision: string
  readonly replayRevision: string
  readonly transformRevision: string
  readonly projectionRevision: string
}
export interface OpenAiFamilyRecord {
  readonly modelId: string
  readonly definitionRevision: string
  readonly imageRule: ImageRule
  readonly efforts: readonly string[]
  readonly inputScope: 'inherited_context_total' | 'scope_unknown'
  readonly tokenizerRevision: string
  readonly transformRevision: string
  readonly original: readonly OpenAiOriginalRecord[]
}

// Exact original factory outputs frozen before this successor, not old factory aliases.
const observedOriginals = {
  'openai/gpt-6-astra': {
    definitionRevision: '4',
    implementationRevision: 'mp4-17',
    algorithmRevision:
      'openai-gpt-6-astra-final-visible-json-o200k-patches-1/response-calibration-1',
    tokenizerRevision: 'js-tiktoken-1.0.21/o200k-base-gpt-6-astra-surrogate/1',
    replayRevision: 'openai-gpt-6-astra-visible-image-units-json-net-estimated/1',
    transformRevision: 'openrouter-wire/2',
    projectionRevision: 'openrouter-input-projection/2',
  },
  'openai/gpt-6-astra-pro': {
    definitionRevision: '5',
    implementationRevision: 'mp4-17',
    algorithmRevision:
      'openai-gpt-6-astra-pro-final-visible-json-o200k-image-proxy-1/response-calibration-1',
    tokenizerRevision: 'js-tiktoken-1.0.21/o200k-base-gpt-6-astra-pro-surrogate/1',
    replayRevision: 'visible-final-units-json-net-estimated/1',
    transformRevision: 'openrouter-input-transform/pro-scope-1',
    projectionRevision: 'openrouter-input-projection/2',
  },
  'openai/gpt-6-sol': {
    definitionRevision: '5',
    implementationRevision: 'mp4-17',
    algorithmRevision: 'openai-gpt-6-sol-final-visible-json-image-proxy-2/response-calibration-1',
    tokenizerRevision: 'js-tiktoken-1.0.21/o200k-base-gpt-6-sol-surrogate/1',
    replayRevision: 'visible-final-units-json-net-estimated/1',
    transformRevision: 'openrouter-wire/2',
    projectionRevision: 'openrouter-input-projection/2',
  },
  'openai/gpt-6-sol-pro': {
    definitionRevision: '5',
    implementationRevision: 'mp4-17',
    algorithmRevision:
      'openai-gpt-6-sol-pro-final-visible-json-image-proxy-2/response-calibration-1',
    tokenizerRevision: 'js-tiktoken-1.0.21/o200k-base-gpt-6-sol-pro-surrogate/1',
    replayRevision: 'visible-final-units-json-net-estimated/1',
    transformRevision: 'openrouter-input-transform/pro-scope-1',
    projectionRevision: 'openrouter-input-projection/2',
  },
  'openai/gpt-6-luna': {
    definitionRevision: '6',
    implementationRevision: 'mp4-17',
    algorithmRevision: 'openai-gpt-6-luna-final-visible-json-image-proxy-2/response-calibration-1',
    tokenizerRevision: 'js-tiktoken-1.0.21/o200k-base-gpt-6-luna-surrogate/1',
    replayRevision: 'visible-final-units-json-net-estimated/1',
    transformRevision: 'openrouter-wire/2',
    projectionRevision: 'openrouter-input-projection/2',
  },
  'openai/gpt-6-luna-pro': {
    definitionRevision: '5',
    implementationRevision: 'mp4-17',
    algorithmRevision:
      'openai-gpt-6-luna-pro-final-visible-json-image-proxy-2/response-calibration-1',
    tokenizerRevision: 'js-tiktoken-1.0.21/o200k-base-gpt-6-luna-pro-surrogate/1',
    replayRevision: 'visible-final-units-json-net-estimated/1',
    transformRevision: 'openrouter-input-transform/pro-scope-1',
    projectionRevision: 'openrouter-input-projection/2',
  },
  'openai/gpt-5.6-sol': {
    definitionRevision: '8',
    implementationRevision: 'mp4-17',
    algorithmRevision: 'openai-gpt-5.6-o200k-base-complete-output-history-7/response-calibration-1',
    tokenizerRevision: 'tokenizer-basis/openai-gpt-5.6-o200k-base-complete-output-6',
    replayRevision: 'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/2',
    transformRevision: 'openrouter-wire/2',
    projectionRevision: 'openrouter-input-projection/2',
  },
  'openai/gpt-5.6-sol-pro': {
    definitionRevision: '7',
    implementationRevision: 'mp4-17',
    algorithmRevision: 'openai-gpt-5.6-pro-base-image-proxy-1/response-calibration-1',
    tokenizerRevision: 'tokenizer-basis/openai-gpt-5.6-pro-base-image-proxy-1',
    replayRevision: 'visible-final-units-json-net-estimated/1',
    transformRevision: 'openrouter-input-transform/pro-scope-1',
    projectionRevision: 'openrouter-input-projection/2',
  },
  'openai/gpt-5.6-terra': {
    definitionRevision: '8',
    implementationRevision: 'mp4-17',
    algorithmRevision: 'openai-gpt-5.6-o200k-base-complete-output-history-7/response-calibration-1',
    tokenizerRevision: 'tokenizer-basis/openai-gpt-5.6-o200k-base-complete-output-6',
    replayRevision: 'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/2',
    transformRevision: 'openrouter-wire/2',
    projectionRevision: 'openrouter-input-projection/2',
  },
  'openai/gpt-5.6-terra-pro': {
    definitionRevision: '7',
    implementationRevision: 'mp4-17',
    algorithmRevision: 'openai-gpt-5.6-pro-base-image-proxy-1/response-calibration-1',
    tokenizerRevision: 'tokenizer-basis/openai-gpt-5.6-pro-base-image-proxy-1',
    replayRevision: 'visible-final-units-json-net-estimated/1',
    transformRevision: 'openrouter-input-transform/pro-scope-1',
    projectionRevision: 'openrouter-input-projection/2',
  },
  'openai/gpt-5.6-luna': {
    definitionRevision: '8',
    implementationRevision: 'mp4-17',
    algorithmRevision: 'openai-gpt-5.6-o200k-base-complete-output-history-7/response-calibration-1',
    tokenizerRevision: 'tokenizer-basis/openai-gpt-5.6-o200k-base-complete-output-6',
    replayRevision: 'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/2',
    transformRevision: 'openrouter-wire/2',
    projectionRevision: 'openrouter-input-projection/2',
  },
  'openai/gpt-5.6-luna-pro': {
    definitionRevision: '7',
    implementationRevision: 'mp4-17',
    algorithmRevision: 'openai-gpt-5.6-pro-base-image-proxy-1/response-calibration-1',
    tokenizerRevision: 'tokenizer-basis/openai-gpt-5.6-pro-base-image-proxy-1',
    replayRevision: 'visible-final-units-json-net-estimated/1',
    transformRevision: 'openrouter-input-transform/pro-scope-1',
    projectionRevision: 'openrouter-input-projection/2',
  },
} as const

const earlier56 = Object.freeze([
  Object.freeze({
    definitionRevision: '6',
    implementationRevision: 'mp4-12',
    algorithmRevision: 'openai-gpt-5.6-o200k-base-complete-output-6/response-calibration-1',
    replayRevision: 'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/1',
  }),
  Object.freeze({
    definitionRevision: '7',
    implementationRevision: 'mp4-16',
    algorithmRevision: 'openai-gpt-5.6-o200k-base-complete-output-history-7/response-calibration-1',
    replayRevision: 'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/2',
  }),
])
function record(
  modelId: keyof typeof observedOriginals,
  definitionRevision: string,
  imageRule: ImageRule,
  efforts: readonly string[],
  inputScope: OpenAiFamilyRecord['inputScope'],
  previous: boolean = false,
): OpenAiFamilyRecord {
  const original = observedOriginals[modelId]
  return Object.freeze({
    modelId,
    definitionRevision,
    imageRule,
    efforts,
    inputScope,
    tokenizerRevision: original.tokenizerRevision,
    transformRevision: original.transformRevision,
    original: Object.freeze([
      ...(previous ? earlier56.map(row => Object.freeze({ ...original, ...row })) : []),
      Object.freeze(original),
    ]),
  })
}
export const openAiFamilyRecords: Readonly<Record<string, OpenAiFamilyRecord>> = Object.freeze({
  'openai/gpt-6-astra': record(
    'openai/gpt-6-astra',
    '5',
    'astra-patch',
    astraEfforts,
    'inherited_context_total',
  ),
  'openai/gpt-6-astra-pro': record(
    'openai/gpt-6-astra-pro',
    '6',
    'astra-patch',
    astraEfforts,
    'scope_unknown',
  ),
  'openai/gpt-6-sol': record(
    'openai/gpt-6-sol',
    '6',
    'sol-luna-auto-proxy',
    standardEfforts,
    'inherited_context_total',
  ),
  'openai/gpt-6-sol-pro': record(
    'openai/gpt-6-sol-pro',
    '6',
    'sol-luna-auto-proxy',
    standardEfforts,
    'scope_unknown',
  ),
  'openai/gpt-6-luna': record(
    'openai/gpt-6-luna',
    '7',
    'sol-luna-auto-proxy',
    standardEfforts,
    'inherited_context_total',
  ),
  'openai/gpt-6-luna-pro': record(
    'openai/gpt-6-luna-pro',
    '6',
    'sol-luna-auto-proxy',
    standardEfforts,
    'scope_unknown',
  ),
  'openai/gpt-5.6-sol': record(
    'openai/gpt-5.6-sol',
    '9',
    'gpt56-patch',
    standardEfforts,
    'inherited_context_total',
    true,
  ),
  'openai/gpt-5.6-sol-pro': record(
    'openai/gpt-5.6-sol-pro',
    '8',
    'gpt56-patch',
    standardEfforts,
    'scope_unknown',
  ),
  'openai/gpt-5.6-terra': record(
    'openai/gpt-5.6-terra',
    '9',
    'gpt56-patch',
    standardEfforts,
    'inherited_context_total',
    true,
  ),
  'openai/gpt-5.6-terra-pro': record(
    'openai/gpt-5.6-terra-pro',
    '8',
    'gpt56-patch',
    standardEfforts,
    'scope_unknown',
  ),
  'openai/gpt-5.6-luna': record(
    'openai/gpt-5.6-luna',
    '9',
    'gpt56-patch',
    standardEfforts,
    'inherited_context_total',
    true,
  ),
  'openai/gpt-5.6-luna-pro': record(
    'openai/gpt-5.6-luna-pro',
    '8',
    'gpt56-patch',
    standardEfforts,
    'scope_unknown',
  ),
})
export function openAiFamilyRecord(modelId: string): OpenAiFamilyRecord | undefined {
  return Object.hasOwn(openAiFamilyRecords, modelId) ? openAiFamilyRecords[modelId] : undefined
}
export type OpenAiDetailClass = 'visible' | 'wholeGroup' | 'uninterpretable'
/** Classifies one retained detail; unavailable is never a visible fallback. */
export function classifyOpenAiDetail(detail: unknown): OpenAiDetailClass {
  if (
    !object(detail) ||
    (detail.format !== undefined && detail.format !== 'openai-responses-v1') ||
    (detail.id !== undefined && detail.id !== null && typeof detail.id !== 'string') ||
    (detail.index !== undefined && !isNonNegativeJsonInteger(detail.index))
  )
    return 'uninterpretable'
  const key =
    detail.type === 'reasoning.encrypted'
      ? 'data'
      : detail.type === 'reasoning.text'
        ? 'text'
        : detail.type === 'reasoning.summary'
          ? 'summary'
          : undefined
  if (
    !key ||
    typeof detail[key] !== 'string' ||
    Object.keys(detail).some(name => !['type', key, 'format', 'id', 'index'].includes(name))
  )
    return 'uninterpretable'
  return key === 'data'
    ? detail.data === '' || detail.format !== 'openai-responses-v1'
      ? 'uninterpretable'
      : 'wholeGroup'
    : 'visible'
}
export function openAiEnvelopeApplies(envelope: JsonObject, row: OpenAiFamilyRecord): boolean {
  const provider = envelope.provider
  const reasoning = envelope.reasoning
  return (
    envelope.model === row.modelId &&
    object(provider) &&
    Object.keys(provider).length === 3 &&
    Array.isArray(provider.order) &&
    provider.order.length === 1 &&
    provider.order[0] === 'openai' &&
    provider.allow_fallbacks === false &&
    provider.require_parameters === true &&
    (reasoning === undefined ||
      (object(reasoning) &&
        Object.keys(reasoning).length === 1 &&
        typeof reasoning.effort === 'string' &&
        row.efforts.includes(reasoning.effort)))
  )
}
export function originalOpenAiRecord(
  row: OpenAiFamilyRecord,
  definitionRevision: string,
  implementationRevision: string,
): OpenAiOriginalRecord | undefined {
  return row.original.find(
    original =>
      original.definitionRevision === definitionRevision &&
      original.implementationRevision === implementationRevision,
  )
}
/** The successor accepts only its assigned current coordinates and explicit original facts. */
export function openAiBasisRecord(
  row: OpenAiFamilyRecord,
  definitionRevision: string,
  implementationRevision: string,
): OpenAiOriginalRecord | undefined {
  return definitionRevision === row.definitionRevision &&
    implementationRevision === OPENAI_FAMILY_IMPLEMENTATION
    ? {
        definitionRevision,
        implementationRevision,
        algorithmRevision: OPENAI_FAMILY_ALGORITHM,
        tokenizerRevision: row.tokenizerRevision,
        replayRevision: OPENAI_FAMILY_REPLAY,
        transformRevision: row.transformRevision,
        projectionRevision: INPUT_PROJECTION_REVISION,
      }
    : originalOpenAiRecord(row, definitionRevision, implementationRevision)
}
export function openAiOriginalBasisApplies(row: OpenAiFamilyRecord): OriginalBasisApplies {
  return (basis: CountingBasis, base) => {
    const original = openAiBasisRecord(
      row,
      basis.binding.definition.revision,
      basis.binding.implementation.revision,
    )
    return (
      !!original &&
      basis.model === row.modelId &&
      basis.provider === 'openai' &&
      basis.binding.definition.modelId === row.modelId &&
      basis.binding.implementation.name === 'pi-ai:openai' &&
      basis.meterRevision === original.algorithmRevision &&
      basis.tokenizerRevision === original.tokenizerRevision &&
      basis.replayRevision === original.replayRevision &&
      base.base === original.transformRevision &&
      basis.projectionRevision === original.projectionRevision
    )
  }
}
