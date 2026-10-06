import {
  isNonNegativeJsonInteger,
  readOpaqueJson,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { CountingBasis } from '@omne-harness-lite/model-response'
import type { InputMeter } from '@omne-harness-lite/model-request-runtime'
import type { OriginalBasisApplies } from '../meter-transform.ts'
import { object } from '../json.ts'
import { canonicalProjection, INPUT_PROJECTION_REVISION } from '../projection.ts'
import type { OutputGroupSource, OutputHistoryPolicy } from './output-history.ts'

// mp4-20 = mp4-19 plus the guard-4 identity mapping. Admitting a present identity
// changes planned outputs (unavailable -> estimated), so the family implementation
// is bumped; algorithm, tokenizer, replay and definition 5 are unchanged.
export const XAI_HISTORY_IMPLEMENTATION = 'mp4-20'
export const XAI_HISTORY_ALGORITHM = 'xai-visible-json-complete-output-group-estimated/1'
export const XAI_HISTORY_REPLAY = 'xai-complete-output-group-workload-estimated/1'
export const XAI_HISTORY_EVIDENCE =
  'D107 xAI complete-output applicability revision 2: one complete same-model original upstream O is a workload-related estimated input proxy, including reasoning, with zero estimated net group framing; not exact occupancy or an upper bound. Visible Grok Build bytes/4 offsets remain two-fit surrogates. mp4-20 guard 4 admits only the exact identity pair servingProvider "xAI" / upstreamModel = route id, extracted from the 2026-09-30 real raw SSE originals gen-1790759928-ziQ41FzufJSwqWS13mog (grok-4.7) and gen-1790759941-akexGaVG7WbS2xgQmRwI (grok-4.6); absent identity is not backfilled. Ciphertext replay acceptance, images and effort holdouts remain unverified.'

interface BasisRow {
  readonly definition: string
  readonly implementation: string
  readonly algorithm: string
  readonly replay: string
  readonly projection: string
}
/**
 * Literal OpenRouter serving identity observed for one leaf. Values come from the
 * 2026-09-30 real raw SSE originals (research/.../xai/2026-09-30-identity-and-reasoning-format.md
 * "2026-09-30 真实身份原件"): every frame carried `provider: "xAI"` and `model` equal to the
 * exact route id. Matching is byte-exact; no case folding, trimming or prefix rule.
 */
interface XaiIdentity {
  readonly servingProvider: string
  readonly upstreamModel: string
}
interface XaiRow {
  readonly modelId: string
  readonly tokenizer: string
  readonly identity: XaiIdentity
  readonly original: readonly BasisRow[]
}
const visibleReplay = 'visible-final-units-json-net-estimated/1'
const oldProjection = 'openrouter-input-projection/2'
const rows: readonly XaiRow[] = [
  {
    modelId: 'x-ai/grok-4.6',
    tokenizer: 'tokenizer-basis/grok-build-visible-text-tools-effort-offset141-2',
    identity: { servingProvider: 'xAI', upstreamModel: 'x-ai/grok-4.6' },
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
    identity: { servingProvider: 'xAI', upstreamModel: 'x-ai/grok-4.7' },
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

/** V5 sources: mp4-19 (no identity mapping) and the current mp4-20 share every basis coordinate. */
const v5Implementations: readonly string[] = ['mp4-19', XAI_HISTORY_IMPLEMENTATION]

function originalRow(
  row: XaiRow,
  definition: string,
  implementation: string,
): BasisRow | undefined {
  if (definition === '5' && v5Implementations.includes(implementation))
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
  if (!object(detail) || !detailIdentityValid(detail)) return 'uninterpretable'
  const field =
    detail.type === 'reasoning.summary'
      ? 'summary'
      : detail.type === 'reasoning.encrypted'
        ? 'data'
        : undefined
  return field &&
    typeof detail[field] === 'string' &&
    detail[field].length > 0 &&
    // OpenRouter may replace streamed ciphertext with this literal placeholder.
    (field !== 'data' || detail.data !== '[REDACTED]') &&
    Object.keys(detail).every(key => ['type', field, 'format', 'id', 'index'].includes(key))
    ? 'wholeGroup'
    : 'uninterpretable'
}

function detailIdentityValid(detail: JsonObject): boolean {
  return !(
    detail.format !== 'xai-responses-v1' ||
    (detail.id !== undefined && detail.id !== null && typeof detail.id !== 'string') ||
    (detail.index !== undefined && !isNonNegativeJsonInteger(detail.index))
  )
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

interface ReportedIdentity {
  readonly servingProvider?: string | undefined
  readonly upstreamModel?: string | undefined
}

/**
 * D107 xAI revision 2 guard 4. Absent identity is admitted and never backfilled
 * from the route or provider name. A present identity must be the complete pair
 * extracted from the real originals; a lone field or any other value is unavailable.
 */
function identityApplies(row: XaiRow, reported: ReportedIdentity): boolean {
  if (reported.servingProvider === undefined && reported.upstreamModel === undefined) return true
  return (
    reported.servingProvider === row.identity.servingProvider &&
    reported.upstreamModel === row.identity.upstreamModel
  )
}

/** Origin identity must agree with the observed response provenance, absence included. */
function sameIdentity(a: ReportedIdentity, b: ReportedIdentity): boolean {
  return a.servingProvider === b.servingProvider && a.upstreamModel === b.upstreamModel
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
  if (!envelopeApplies(row)) return false
  const request = source.observation.inputCalibration.requestInput
  const basis = request.kind === 'known' ? request.countingBasis : undefined
  const binding = source.origin?.adaptation ?? basis?.binding
  if (!bindingApplies(row) || !originApplies(row)) return false
  const observed = source.observation.inputCalibration.observedInput
  if (!observedApplies(row)) return false
  return opaqueBlocksApply(row)

  function envelopeApplies(row: XaiRow): boolean {
    return !(
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
  }
  function bindingApplies(row: XaiRow): boolean {
    return !(
      !binding ||
      binding.definition.modelId !== row.modelId ||
      binding.implementation.name !== 'pi-ai:xai' ||
      !originalRow(row, binding.definition.revision, binding.implementation.revision)
    )
  }
  function originApplies(row: XaiRow): boolean {
    return !(
      source.origin &&
      (source.origin.provider !== 'xai' ||
        !effortApplies(source.origin.parameters.reasoningEffort) ||
        !identityApplies(row, source.origin))
    )
  }
  function observedApplies(row: XaiRow): boolean {
    return !(
      observed.kind !== 'unavailable' &&
      (observed.provenance.adapterRevision !== 'openrouter-usage-reader/2' ||
        !identityApplies(row, observed.provenance) ||
        (source.origin !== undefined && !sameIdentity(source.origin, observed.provenance)))
    )
  }
  function opaqueBlocksApply(row: XaiRow): boolean {
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
}

export const xaiOutputHistoryPolicy: OutputHistoryPolicy = Object.freeze({
  classifyUnit: classifyXaiUnit,
  sourceApplies,
  originalBasisApplies,
  requiresSignedPrefix: () => false,
  projectionRevisionApplies: (revision: string) =>
    revision === oldProjection || revision === INPUT_PROJECTION_REVISION,
})
