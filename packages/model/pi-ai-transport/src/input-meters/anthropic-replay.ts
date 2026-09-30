import { isNonNegativeJsonInteger, type JsonValue } from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'
import type { CountingBasis } from '@omne-harness-lite/model-response'
import type { InputMeter } from '../input-meter.ts'
import type { OriginalBasisApplies } from '../meter-transform.ts'
import { canonicalProjection, INPUT_PROJECTION_REVISION } from '../projection.ts'
import type { OutputGroupSource, OutputHistoryPolicy } from './output-history.ts'

export const ANTHROPIC_HISTORY_ALGORITHM =
  'anthropic-legacy-bpe-plus-vision-patches-complete-output-5/response-calibration-1'
export const ANTHROPIC_TOKENIZER_REVISION =
  'tokenizer-basis/anthropic-legacy-bpe-plus-vision-patches-4'
export const ANTHROPIC_REPLAY_REVISION =
  'anthropic-complete-signed-encrypted-output-zero-framing-estimated/1'

/** Original facts, not executable old factory aliases. D107 priority-family revision 5. */
export const anthropicOriginalMeter = Object.freeze({
  definitionRevision: '3',
  implementationRevision: 'mp4-17',
  algorithmRevision: 'anthropic-legacy-bpe-plus-vision-patches-4/response-calibration-1',
  tokenizerRevision: ANTHROPIC_TOKENIZER_REVISION,
  replayRevision: 'visible-final-units-json-net-estimated/1',
  transformRevision: 'openrouter-wire/2',
  projectionRevision: 'openrouter-input-projection/2',
})

/** All four leaves share one contribution formula; only the prefix obligation differs. */
export const anthropicReplayModels = Object.freeze([
  Object.freeze({ modelId: 'anthropic/claude-opus-5.5', requiresSignedPrefix: true }),
  Object.freeze({ modelId: 'anthropic/claude-opus-5', requiresSignedPrefix: false }),
  Object.freeze({ modelId: 'anthropic/claude-sonnet-5', requiresSignedPrefix: false }),
  Object.freeze({ modelId: 'anthropic/claude-fable-5.1', requiresSignedPrefix: true }),
])

export const anthropicReplayEfforts = Object.freeze(['low', 'medium', 'high', 'max'])

const currentRecord = Object.freeze({
  definitionRevision: '4',
  implementationRevision: 'mp4-18',
  algorithmRevision: ANTHROPIC_HISTORY_ALGORITHM,
  tokenizerRevision: ANTHROPIC_TOKENIZER_REVISION,
  replayRevision: ANTHROPIC_REPLAY_REVISION,
  transformRevision: 'openrouter-wire/2',
  projectionRevision: INPUT_PROJECTION_REVISION,
})
const records = Object.freeze([anthropicOriginalMeter, currentRecord])
const supported = (model: string) => anthropicReplayModels.some(row => row.modelId === model)
const effortApplies = (value: JsonValue | undefined) =>
  value === undefined || (typeof value === 'string' && anthropicReplayEfforts.includes(value))
const providerApplies = (value: string | undefined) =>
  value === undefined || value === 'anthropic' || value === 'Anthropic'

function currentMeterApplies(meter: InputMeter): boolean {
  return (
    supported(meter.modelId) &&
    meter.provider === 'anthropic' &&
    meter.definitionRevision === currentRecord.definitionRevision &&
    meter.implementation.name === 'pi-ai:anthropic' &&
    meter.implementation.revision === currentRecord.implementationRevision &&
    meter.algorithmRevision === currentRecord.algorithmRevision &&
    meter.tokenizerRevision === currentRecord.tokenizerRevision &&
    meter.replayRevision === currentRecord.replayRevision &&
    meter.transformRevision === currentRecord.transformRevision
  )
}

function originalBasisApplies(meter: InputMeter): OriginalBasisApplies {
  return (basis: CountingBasis, base) => {
    const row = records.find(
      item =>
        item.definitionRevision === basis.binding.definition.revision &&
        item.implementationRevision === basis.binding.implementation.revision,
    )
    return (
      currentMeterApplies(meter) &&
      row !== undefined &&
      base.base === row.transformRevision &&
      basis.model === meter.modelId &&
      basis.provider === 'anthropic' &&
      basis.binding.definition.modelId === meter.modelId &&
      basis.binding.implementation.name === 'pi-ai:anthropic' &&
      basis.meterRevision === row.algorithmRevision &&
      basis.tokenizerRevision === row.tokenizerRevision &&
      basis.replayRevision === row.replayRevision &&
      basis.projectionRevision === row.projectionRevision
    )
  }
}

function sourceApplies(
  source: OutputGroupSource,
  meter: InputMeter,
  envelope: Readonly<Record<string, JsonValue>>,
): boolean {
  if (!currentMeterApplies(meter)) return false
  const request = source.observation.inputCalibration.requestInput
  const observed = source.observation.inputCalibration.observedInput
  const binding =
    source.origin?.adaptation ??
    (request.kind === 'known' ? request.countingBasis.binding : undefined)
  if (
    !binding ||
    binding.definition.modelId !== meter.modelId ||
    binding.implementation.name !== 'pi-ai:anthropic' ||
    !records.some(
      row =>
        row.definitionRevision === binding.definition.revision &&
        row.implementationRevision === binding.implementation.revision,
    ) ||
    envelope.model !== meter.modelId ||
    !object(envelope.provider) ||
    canonicalProjection(envelope.provider) !==
      canonicalProjection({
        order: ['anthropic'],
        allow_fallbacks: false,
        require_parameters: true,
      }) ||
    (envelope.reasoning !== undefined &&
      (!object(envelope.reasoning) ||
        Object.keys(envelope.reasoning).some(key => key !== 'effort') ||
        !effortApplies(envelope.reasoning.effort)))
  )
    return false
  if (
    source.origin &&
    (source.origin.provider !== 'anthropic' ||
      !effortApplies(source.origin.parameters.reasoningEffort) ||
      (source.origin.parameters.extra !== undefined &&
        Object.keys(source.origin.parameters.extra).length > 0) ||
      !providerApplies(source.origin.servingProvider) ||
      (source.origin.upstreamModel !== undefined && source.origin.upstreamModel !== meter.modelId))
  )
    return false
  return (
    observed.kind === 'unavailable' ||
    (observed.provenance.adapterRevision === 'openrouter-usage-reader/2' &&
      providerApplies(observed.provenance.servingProvider) &&
      (observed.provenance.upstreamModel === undefined ||
        observed.provenance.upstreamModel === meter.modelId))
  )
}

/**
 * Called only on owned JSON. Anthropic text is a display summary; its signature
 * carries opaque thinking. Unknown/unsigned details never become visible BPE.
 * Unknown JSON members are retained by the wire projector, not removed here.
 */
export function classifyAnthropicReasoning(
  details: JsonValue | undefined,
): 'visible' | 'wholeGroup' | 'uninterpretable' {
  if (details === undefined) return 'visible'
  if (!Array.isArray(details) || details.length === 0) return 'uninterpretable'
  for (const detail of details) {
    if (
      !object(detail) ||
      detail.format !== 'anthropic-claude-v1' ||
      (detail.id !== undefined && detail.id !== null && typeof detail.id !== 'string') ||
      (detail.index !== undefined && !isNonNegativeJsonInteger(detail.index))
    )
      return 'uninterpretable'
    if (detail.type === 'reasoning.text') {
      if (
        typeof detail.text !== 'string' ||
        typeof detail.signature !== 'string' ||
        detail.signature.length === 0
      )
        return 'uninterpretable'
    } else if (detail.type === 'reasoning.encrypted') {
      // OpenRouter may stream the literal `[REDACTED]` placeholder instead of ciphertext
      // (dispatcher ruling R-M, same as the xAI policy); it is neither replayable nor meterable.
      if (
        typeof detail.data !== 'string' ||
        detail.data.length === 0 ||
        detail.data === '[REDACTED]'
      )
        return 'uninterpretable'
    } else return 'uninterpretable'
  }
  return 'wholeGroup'
}

export const anthropicOutputHistoryPolicy: OutputHistoryPolicy = Object.freeze({
  classifyUnit(unit: JsonValue) {
    if (!object(unit)) return 'uninterpretable'
    const classified = classifyAnthropicReasoning(unit.reasoning_details)
    return classified === 'wholeGroup' && unit.role !== 'assistant' ? 'uninterpretable' : classified
  },
  sourceApplies,
  originalBasisApplies,
  requiresSignedPrefix(_source: OutputGroupSource, meter: InputMeter) {
    return anthropicReplayModels.some(
      row => row.modelId === meter.modelId && row.requiresSignedPrefix,
    )
  },
  projectionRevisionApplies(revision: string) {
    return (
      revision === anthropicOriginalMeter.projectionRevision ||
      revision === INPUT_PROJECTION_REVISION
    )
  },
})
