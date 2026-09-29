import {
  isNonNegativeJsonInteger,
  readOpaqueJson,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import { canonicalProjection } from '../projection.ts'
import type { InputMeter, ReplayMeterInput, MeterContribution } from '../input-meter.ts'
import {
  replayOutputHistory,
  type OutputHistoryPolicy,
  type OutputUnitClassification,
} from './output-history.ts'
import type { OriginalBasisApplies } from '../meter-transform.ts'

export const openAi56ReplayModels: ReadonlySet<string> = new Set([
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-luna',
])
export const OPENAI_56_REPLAY_REVISION =
  'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/2'

export const OPENAI_56_TOKENIZER_REVISION =
  'tokenizer-basis/openai-gpt-5.6-o200k-base-complete-output-6'
export const OPENAI_56_HISTORY_ALGORITHM = 'openai-gpt-5.6-o200k-base-complete-output-history-7'

// These are original facts interpretable by the successor, never factory aliases.
const sourceBindings = [
  {
    definition: '6',
    implementation: 'mp4-12',
    algorithm: 'openai-gpt-5.6-o200k-base-complete-output-6/response-calibration-1',
    replay: 'openai-gpt-5.6-complete-encrypted-group-output-zero-framing-estimated/1',
  },
  {
    definition: '7',
    implementation: 'mp4-16',
    algorithm: `${OPENAI_56_HISTORY_ALGORITHM}/response-calibration-1`,
    replay: OPENAI_56_REPLAY_REVISION,
  },
  {
    definition: '8',
    implementation: 'mp4-17',
    algorithm: `${OPENAI_56_HISTORY_ALGORITHM}/response-calibration-1`,
    replay: OPENAI_56_REPLAY_REVISION,
  },
] as const
const efforts = ['none', 'low', 'medium', 'high', 'max']
function originalBasisApplies(meter: InputMeter): OriginalBasisApplies {
  return (basis, base) => {
    const row = sourceBindings.find(
      item =>
        item.definition === basis.binding.definition.revision &&
        item.implementation === basis.binding.implementation.revision,
    )
    return (
      !!row &&
      base.base === 'openrouter-wire/2' &&
      basis.model === meter.modelId &&
      basis.provider === 'openai' &&
      basis.binding.definition.modelId === meter.modelId &&
      basis.binding.implementation.name === meter.implementation.name &&
      basis.tokenizerRevision === OPENAI_56_TOKENIZER_REVISION &&
      basis.meterRevision === row.algorithm &&
      basis.replayRevision === row.replay &&
      ['openrouter-input-projection/2', 'openrouter-input-projection/3'].includes(
        basis.projectionRevision,
      )
    )
  }
}

function classification(unit: JsonValue): OutputUnitClassification {
  if (!object(unit) || !Object.hasOwn(unit, 'reasoning_details')) return 'visible'
  if (!Array.isArray(unit.reasoning_details)) return 'uninterpretable'
  let whole = false
  for (const detail of unit.reasoning_details) {
    if (!object(detail)) return 'uninterpretable'
    if (
      detail.type === 'reasoning.encrypted' &&
      typeof detail.data === 'string' &&
      detail.data.length
    )
      whole = true
    else if (
      !(detail.type === 'reasoning.text' && typeof detail.text === 'string') &&
      !(detail.type === 'reasoning.summary' && typeof detail.summary === 'string')
    )
      return 'uninterpretable'
  }
  return whole ? 'wholeGroup' : 'visible'
}
/** Current GPT-5.6 finite rules, consumed by the common whole-group algorithm. */
export const OPENAI_56_OUTPUT_POLICY: OutputHistoryPolicy = {
  classifyUnit: classification,
  originalBasisApplies,
  requiresSignedPrefix: () => false,
  projectionRevisionApplies: revision =>
    ['openrouter-input-projection/2', 'openrouter-input-projection/3'].includes(revision),
  sourceApplies(source, meter, envelope) {
    const observation = source.observation
    const request = observation.inputCalibration.requestInput
    const original =
      source.origin?.adaptation ??
      (request.kind === 'known' ? request.countingBasis.binding : undefined)
    const row = sourceBindings.find(
      row =>
        row.definition === original?.definition.revision &&
        row.implementation === original?.implementation.revision,
    )
    if (
      !openAi56ReplayModels.has(meter.modelId) ||
      meter.provider !== 'openai' ||
      meter.implementation.name !== 'pi-ai:openai' ||
      !row ||
      original?.definition.modelId !== meter.modelId ||
      original.implementation.name !== meter.implementation.name ||
      envelope.model !== meter.modelId ||
      canonicalProjection(envelope.provider) !==
        canonicalProjection({ order: ['openai'], allow_fallbacks: false, require_parameters: true })
    )
      return false
    if (
      envelope.reasoning !== undefined &&
      (!object(envelope.reasoning) ||
        Object.keys(envelope.reasoning).length !== 1 ||
        !efforts.includes(String(envelope.reasoning.effort)))
    )
      return false
    if (
      source.origin &&
      (source.origin.provider !== 'openai' ||
        (source.origin.parameters.reasoningEffort !== undefined &&
          !efforts.includes(String(source.origin.parameters.reasoningEffort))) ||
        (source.origin.upstreamModel !== undefined &&
          source.origin.upstreamModel !== meter.modelId) ||
        (source.origin.servingProvider !== undefined &&
          !['openai', 'OpenAI'].includes(source.origin.servingProvider)))
    )
      return false
    const observed = observation.inputCalibration.observedInput
    if (
      observed.kind !== 'unavailable' &&
      (observed.provenance.adapterRevision !== 'openrouter-usage-reader/2' ||
        (observed.provenance.upstreamModel !== undefined &&
          observed.provenance.upstreamModel !== meter.modelId) ||
        (observed.provenance.servingProvider !== undefined &&
          !['openai', 'OpenAI'].includes(observed.provenance.servingProvider)))
    )
      return false
    for (const block of observation.outputBlocks) {
      if (block.kind !== 'thinking') continue
      const opaque = block.opaque === undefined ? undefined : readOpaqueJson(block.opaque)
      if (
        !object(opaque) ||
        opaque.routeName !== meter.modelId ||
        !Array.isArray(opaque.reasoning_details) ||
        !opaque.reasoning_details.length ||
        Object.keys(opaque).some(key => !['routeName', 'reasoning_details'].includes(key))
      )
        return false
      for (const detail of opaque.reasoning_details) {
        if (
          !object(detail) ||
          detail.format !== 'openai-responses-v1' ||
          (detail.id !== undefined && detail.id !== null && typeof detail.id !== 'string') ||
          (detail.index !== undefined && !isNonNegativeJsonInteger(detail.index))
        )
          return false
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
          (key === 'data' && !detail[key].length) ||
          Object.keys(detail).some(name => !['type', key, 'format', 'id', 'index'].includes(name))
        )
          return false
      }
    }
    return true
  },
}
export function estimateOpenAi56Replay(
  input: ReplayMeterInput,
  meter: InputMeter,
): MeterContribution {
  // The ordinary factory's raw counter supplies the visible path; this adapter
  // is called only after that path has rejected opaque reasoning.
  return replayOutputHistory(input, meter, () => ({ kind: 'unavailable' }), OPENAI_56_OUTPUT_POLICY)
}
