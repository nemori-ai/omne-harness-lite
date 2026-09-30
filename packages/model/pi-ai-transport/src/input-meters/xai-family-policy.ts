import {
  isNonNegativeJsonInteger,
  readOpaqueJson,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { CountingBasis } from '@omne-harness-lite/model-response'
import type { InputMeter } from '../input-meter.ts'
import type { OriginalBasisApplies } from '../meter-transform.ts'
import { object } from '../json.ts'
import { canonicalProjection, INPUT_PROJECTION_REVISION } from '../projection.ts'
import type { OutputGroupSource, OutputHistoryPolicy } from './output-history.ts'

export const XAI_HISTORY_IMPLEMENTATION = 'mp4-19'
export const XAI_HISTORY_ALGORITHM = 'xai-visible-json-complete-output-group-estimated/1'
export const XAI_HISTORY_REPLAY = 'xai-complete-output-group-workload-estimated/1'
export const XAI_HISTORY_EVIDENCE =
  'D107 xAI complete-output applicability revision 2: one complete same-model original upstream O is a workload-related estimated input proxy, including reasoning, with zero estimated net group framing; not exact occupancy or an upper bound. Visible Grok Build bytes/4 offsets remain two-fit surrogates. Real serving-provider/upstream-model identities, ciphertext replay, images and effort holdouts remain unverified.'

interface BasisRow {
  readonly definition: string
  readonly implementation: string
  readonly algorithm: string
  readonly replay: string
  readonly projection: string
}
interface XaiRow {
  readonly modelId: string
  readonly tokenizer: string
  readonly original: readonly BasisRow[]
}
const visibleReplay = 'visible-final-units-json-net-estimated/1'
const oldProjection = 'openrouter-input-projection/2'
const rows: readonly XaiRow[] = [
  {
    modelId: 'x-ai/grok-4.6',
    tokenizer: 'tokenizer-basis/grok-build-visible-text-tools-effort-offset141-2',
    original: [
      {
        definition: '3',
        implementation: 'mp4-17',
        algorithm: 'grok-build-visible-text-tools-effort-offset141-2/response-calibration-1',
        replay: visibleReplay,
        projection: oldProjection,
      },
      {
        definition: '4',
        implementation: 'mp4-18',
        algorithm: 'grok-build-visible-text-tools-effort-offset141-2/response-calibration-1',
        replay: visibleReplay,
        projection: INPUT_PROJECTION_REVISION,
      },
    ],
  },
  {
    modelId: 'x-ai/grok-4.7',
    tokenizer: 'tokenizer-basis/grok-build-visible-text-tools-effort-offset1181-2',
    original: [
      {
        definition: '3',
        implementation: 'mp4-17',
        algorithm: 'grok-build-visible-text-tools-effort-offset1181-2/response-calibration-1',
        replay: visibleReplay,
        projection: oldProjection,
      },
      {
        definition: '4',
        implementation: 'mp4-18',
        algorithm: 'grok-build-visible-text-tools-effort-offset1181-2/response-calibration-1',
        replay: visibleReplay,
        projection: INPUT_PROJECTION_REVISION,
      },
    ],
  },
]

export function xaiRow(modelId: string): XaiRow | undefined {
  return rows.find(row => row.modelId === modelId)
}

function currentMeterApplies(meter: InputMeter, row: XaiRow): boolean {
  return (
    meter.modelId === row.modelId &&
    meter.provider === 'xai' &&
    meter.definitionRevision === '5' &&
    meter.implementation.name === 'pi-ai:xai' &&
    meter.implementation.revision === XAI_HISTORY_IMPLEMENTATION &&
    meter.algorithmRevision === XAI_HISTORY_ALGORITHM &&
    meter.tokenizerRevision === row.tokenizer &&
    meter.replayRevision === XAI_HISTORY_REPLAY &&
    meter.transformRevision === 'openrouter-wire/2'
  )
}

function originalRow(
  row: XaiRow,
  definition: string,
  implementation: string,
): BasisRow | undefined {
  if (definition === '5' && implementation === XAI_HISTORY_IMPLEMENTATION)
    return {
      definition,
      implementation,
      algorithm: XAI_HISTORY_ALGORITHM,
      replay: XAI_HISTORY_REPLAY,
      projection: INPUT_PROJECTION_REVISION,
    }
  return row.original.find(
    item => item.definition === definition && item.implementation === implementation,
  )
}

function originalBasisApplies(meter: InputMeter): OriginalBasisApplies {
  return (basis: CountingBasis, base) => {
    const row = xaiRow(meter.modelId)
    if (!row || !currentMeterApplies(meter, row)) return false
    const original = originalRow(
      row,
      basis.binding.definition.revision,
      basis.binding.implementation.revision,
    )
    return (
      original !== undefined &&
      base.base === 'openrouter-wire/2' &&
      basis.model === row.modelId &&
      basis.provider === 'xai' &&
      basis.binding.definition.modelId === row.modelId &&
      basis.binding.implementation.name === 'pi-ai:xai' &&
      basis.meterRevision === original.algorithm &&
      basis.tokenizerRevision === row.tokenizer &&
      basis.replayRevision === original.replay &&
      basis.projectionRevision === original.projection
    )
  }
}

const effortApplies = (value: JsonValue | undefined) =>
  value === undefined || value === 'low' || value === 'medium' || value === 'high'

export function classifyXaiDetail(detail: JsonValue): 'visible' | 'wholeGroup' | 'uninterpretable' {
  if (
    !object(detail) ||
    detail.format !== 'xai-responses-v1' ||
    (detail.id !== undefined && detail.id !== null && typeof detail.id !== 'string') ||
    (detail.index !== undefined && !isNonNegativeJsonInteger(detail.index))
  )
    return 'uninterpretable'
  const field =
    detail.type === 'reasoning.summary'
      ? 'summary'
      : detail.type === 'reasoning.encrypted'
        ? 'data'
        : undefined
  return field &&
    typeof detail[field] === 'string' &&
    detail[field].length > 0 &&
    Object.keys(detail).every(key => ['type', field, 'format', 'id', 'index'].includes(key))
    ? 'wholeGroup'
    : 'uninterpretable'
}

export function classifyXaiUnit(unit: JsonValue): 'visible' | 'wholeGroup' | 'uninterpretable' {
  if (!object(unit)) return 'uninterpretable'
  if (unit.reasoning_details === undefined) return 'visible'
  if (
    unit.role !== 'assistant' ||
    !Array.isArray(unit.reasoning_details) ||
    !unit.reasoning_details.length
  )
    return 'uninterpretable'
  return unit.reasoning_details.every(detail => classifyXaiDetail(detail) === 'wholeGroup')
    ? 'wholeGroup'
    : 'uninterpretable'
}

function sourceApplies(
  source: OutputGroupSource,
  meter: InputMeter,
  envelope: JsonObject,
): boolean {
  const row = xaiRow(meter.modelId)
  if (!row || !currentMeterApplies(meter, row)) return false
  const provider = envelope.provider
  const reasoning = envelope.reasoning
  if (
    envelope.model !== row.modelId ||
    !object(provider) ||
    canonicalProjection(provider) !==
      canonicalProjection({
        order: ['xai'],
        allow_fallbacks: false,
        require_parameters: true,
      }) ||
    (reasoning !== undefined &&
      (!object(reasoning) ||
        Object.keys(reasoning).length !== 1 ||
        !effortApplies(reasoning.effort)))
  )
    return false
  const request = source.observation.inputCalibration.requestInput
  const basis = request.kind === 'known' ? request.countingBasis : undefined
  const binding = source.origin?.adaptation ?? basis?.binding
  if (
    !binding ||
    binding.definition.modelId !== row.modelId ||
    binding.implementation.name !== 'pi-ai:xai' ||
    !originalRow(row, binding.definition.revision, binding.implementation.revision)
  )
    return false
  if (
    source.origin &&
    (source.origin.provider !== 'xai' ||
      !effortApplies(source.origin.parameters.reasoningEffort) ||
      source.origin.servingProvider !== undefined ||
      source.origin.upstreamModel !== undefined)
  )
    return false
  const observed = source.observation.inputCalibration.observedInput
  if (
    observed.kind !== 'unavailable' &&
    (observed.provenance.adapterRevision !== 'openrouter-usage-reader/2' ||
      observed.provenance.servingProvider !== undefined ||
      observed.provenance.upstreamModel !== undefined)
  )
    return false
  // No real upstream identity mapping has been verified yet. Present identity
  // fields remain unavailable rather than being matched to synthetic TLS labels.
  return source.observation.outputBlocks.some(block => {
    if (block.kind !== 'thinking' || block.opaque === undefined) return false
    const opaque = readOpaqueJson(block.opaque)
    return (
      object(opaque) &&
      opaque.routeName === row.modelId &&
      Object.keys(opaque).every(key => ['routeName', 'reasoning_details'].includes(key)) &&
      Array.isArray(opaque.reasoning_details) &&
      opaque.reasoning_details.length > 0 &&
      opaque.reasoning_details.every(detail => classifyXaiDetail(detail) === 'wholeGroup')
    )
  })
}

export const xaiOutputHistoryPolicy: OutputHistoryPolicy = Object.freeze({
  classifyUnit: classifyXaiUnit,
  sourceApplies,
  originalBasisApplies,
  requiresSignedPrefix: () => false,
  projectionRevisionApplies: (revision: string) =>
    revision === oldProjection || revision === INPUT_PROJECTION_REVISION,
})
