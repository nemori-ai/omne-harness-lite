import {
  isNonNegativeJsonInteger,
  readOpaqueJson,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { ReasoningEffort } from '@omne-harness-lite/model-profile'
import type { CountingBasis } from '@omne-harness-lite/model-response'
import type { InputMeter } from '../input-meter.ts'
import type { OutputGroupSource, OutputHistoryPolicy } from './output-history.ts'
import type { OriginalBasisApplies } from '../meter-transform.ts'
import type { ImageRule } from './openai-images.ts'
import { object } from '../json.ts'
import { INPUT_PROJECTION_REVISION } from '../projection.ts'

export const OPENAI_FAMILY_IMPLEMENTATION = 'mp4-18'
export const OPENAI_FAMILY_ALGORITHM = 'openai-visible-json-complete-output-group-estimated/1'
export const OPENAI_FAMILY_REPLAY = 'openai-complete-output-group-workload-estimated/1'
export const OPENAI_FAMILY_EVIDENCE =
  'D107 priority-family provider revision 5 (2026-09-29): complete unchanged same-model OpenRouter/OpenAI output groups use upstream O once as a workload-related estimated proxy with zero experimental net framing correction; not exact input occupancy or an upper bound, no GPT6 all_turns claim. Pro input usage scope stays unknown. Visible o200k/image rules retain their declared surrogate limits; same-base image reuse is not verified Pro preprocessing and GPT6 o200k is not a tokenizer identity.'
const standardEfforts = Object.freeze(['none', 'low', 'medium', 'high', 'max'] as const)
const astraEfforts = Object.freeze(['low', 'medium', 'high', 'max'] as const)
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
  readonly efforts: readonly ReasoningEffort[]
  readonly inputScope: 'inherited_context_total' | 'scope_unknown'
  readonly visibleDomain: 'finalRequest' | 'visibleJson'
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
  efforts: readonly ReasoningEffort[],
  inputScope: OpenAiFamilyRecord['inputScope'],
  visibleDomain: OpenAiFamilyRecord['visibleDomain'] = 'finalRequest',
  previous: boolean = false,
): OpenAiFamilyRecord {
  const original = observedOriginals[modelId]
  return Object.freeze({
    modelId,
    definitionRevision,
    imageRule,
    efforts,
    inputScope,
    visibleDomain,
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
    'visibleJson',
    true,
  ),
  'openai/gpt-5.6-sol-pro': record(
    'openai/gpt-5.6-sol-pro',
    '8',
    'gpt56-patch',
    standardEfforts,
    'scope_unknown',
    'visibleJson',
  ),
  'openai/gpt-5.6-terra': record(
    'openai/gpt-5.6-terra',
    '9',
    'gpt56-patch',
    standardEfforts,
    'inherited_context_total',
    'visibleJson',
    true,
  ),
  'openai/gpt-5.6-terra-pro': record(
    'openai/gpt-5.6-terra-pro',
    '8',
    'gpt56-patch',
    standardEfforts,
    'scope_unknown',
    'visibleJson',
  ),
  'openai/gpt-5.6-luna': record(
    'openai/gpt-5.6-luna',
    '9',
    'gpt56-patch',
    standardEfforts,
    'inherited_context_total',
    'visibleJson',
    true,
  ),
  'openai/gpt-5.6-luna-pro': record(
    'openai/gpt-5.6-luna-pro',
    '8',
    'gpt56-patch',
    standardEfforts,
    'scope_unknown',
    'visibleJson',
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
        row.efforts.some(effort => effort === reasoning.effort)))
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

export function classifyOpenAiUnit(unit: JsonValue): OpenAiDetailClass {
  if (!object(unit)) return 'uninterpretable'
  if (unit.reasoning_details === undefined) return 'visible'
  if (unit.role !== 'assistant' || !Array.isArray(unit.reasoning_details)) return 'uninterpretable'
  let result: OpenAiDetailClass = 'visible'
  for (const detail of unit.reasoning_details) {
    const classification = classifyOpenAiDetail(detail)
    if (classification === 'uninterpretable') return classification
    if (classification === 'wholeGroup') result = classification
  }
  return result
}
function currentMeterApplies(meter: InputMeter, row: OpenAiFamilyRecord): boolean {
  return (
    meter.modelId === row.modelId &&
    meter.provider === 'openai' &&
    meter.definitionRevision === row.definitionRevision &&
    meter.implementation.name === 'pi-ai:openai' &&
    meter.implementation.revision === OPENAI_FAMILY_IMPLEMENTATION &&
    meter.algorithmRevision === OPENAI_FAMILY_ALGORITHM &&
    meter.replayRevision === OPENAI_FAMILY_REPLAY &&
    meter.tokenizerRevision === row.tokenizerRevision &&
    meter.transformRevision === row.transformRevision
  )
}
function sourceApplies(
  source: OutputGroupSource,
  meter: InputMeter,
  envelope: JsonObject,
): boolean {
  const row = openAiFamilyRecord(meter.modelId)
  if (!row || !currentMeterApplies(meter, row) || !openAiEnvelopeApplies(envelope, row))
    return false
  const { observation, origin } = source
  const request = observation.inputCalibration.requestInput
  const basis = request.kind === 'known' ? request.countingBasis : undefined
  const binding = origin?.adaptation ?? basis?.binding
  if (
    !binding ||
    binding.definition.modelId !== row.modelId ||
    binding.implementation.name !== 'pi-ai:openai' ||
    !openAiBasisRecord(row, binding.definition.revision, binding.implementation.revision)
  )
    return false
  if (
    origin &&
    (origin.provider !== 'openai' ||
      (origin.parameters.reasoningEffort !== undefined &&
        !row.efforts.includes(origin.parameters.reasoningEffort)) ||
      (origin.upstreamModel !== undefined && origin.upstreamModel !== row.modelId) ||
      (origin.servingProvider !== undefined &&
        !['openai', 'OpenAI'].includes(origin.servingProvider)))
  )
    return false
  const observed = observation.inputCalibration.observedInput
  if (
    observed.kind !== 'unavailable' &&
    (row.inputScope === 'scope_unknown' ||
      observed.provenance.adapterRevision !== 'openrouter-usage-reader/2' ||
      (observed.provenance.upstreamModel !== undefined &&
        observed.provenance.upstreamModel !== row.modelId) ||
      (observed.provenance.servingProvider !== undefined &&
        !['openai', 'OpenAI'].includes(observed.provenance.servingProvider)))
  )
    return false
  let encrypted = false
  for (const block of observation.outputBlocks) {
    if (block.kind !== 'thinking') continue
    const opaque = block.opaque === undefined ? undefined : readOpaqueJson(block.opaque)
    if (
      !object(opaque) ||
      opaque.routeName !== row.modelId ||
      Object.keys(opaque).some(key => !['routeName', 'reasoning_details'].includes(key)) ||
      !Array.isArray(opaque.reasoning_details) ||
      !opaque.reasoning_details.length
    )
      return false
    for (const detail of opaque.reasoning_details) {
      if (!object(detail) || detail.format !== 'openai-responses-v1') return false
      const classification = classifyOpenAiDetail(detail)
      if (classification === 'uninterpretable') return false
      encrypted ||= classification === 'wholeGroup'
    }
  }
  return encrypted
}
export const openAiOutputHistoryPolicy: OutputHistoryPolicy = Object.freeze({
  classifyUnit: classifyOpenAiUnit,
  sourceApplies,
  originalBasisApplies(meter: InputMeter) {
    const row = openAiFamilyRecord(meter.modelId)
    return row && currentMeterApplies(meter, row) ? openAiOriginalBasisApplies(row) : () => false
  },
  requiresSignedPrefix: () => false,
  projectionRevisionApplies: (revision: string) =>
    revision === 'openrouter-input-projection/2' || revision === INPUT_PROJECTION_REVISION,
})
