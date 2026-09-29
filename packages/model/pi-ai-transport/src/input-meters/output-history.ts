import { ownFullOutputInput, ownNewOutputInput, ownReplayOutputInput } from './output-input.ts'
import { cacheNeutralBody } from '../anthropic-cache.ts'
import { ownedObject } from '../json.ts'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  writeJsonLossless,
  type JsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type {
  PlanCalibration,
  PlanOutputHistoryGroup,
} from '@omne-harness-lite/model-request-runtime'
import { projectAssistant } from '../assistant-projection.ts'
import {
  canonicalProjection,
  projectionDigest,
  INPUT_PROJECTION_REVISION,
  type InputProjection,
} from '../projection.ts'
import { meterHistoryValid, meterReplayValid } from '../history-projection.ts'
import { ownBasis, relateMeterBases, type OriginalBasisApplies } from '../meter-transform.ts'
import {
  meterContributionValid,
  type InputMeter,
  type FullMeterInput,
  type NewMeterInput,
  type ReplayMeterInput,
  type MeterContribution,
  type TokenMeasurement,
  type HistorySelectionSpan,
} from '../input-meter.ts'
import { fullJsonMarginal } from './marginal.ts'
import { signedPrefixApplies } from './output-prefix.ts'

export type OutputUnitClassification = 'visible' | 'wholeGroup' | 'uninterpretable'
export interface OutputGroupSource {
  readonly observation: Extract<PlanCalibration, { kind: 'observation' }>
  readonly origin?: PlanOutputHistoryGroup['origin']
}
/** Finite family facts; the traversal, source ownership and O arithmetic are common. */
export interface OutputHistoryPolicy {
  readonly classifyUnit: (unit: JsonValue) => OutputUnitClassification
  readonly sourceApplies: (
    source: OutputGroupSource,
    meter: InputMeter,
    envelope: JsonObject,
  ) => boolean
  readonly originalBasisApplies: (meter: InputMeter) => OriginalBasisApplies
  readonly requiresSignedPrefix: (source: OutputGroupSource, meter: InputMeter) => boolean
  readonly projectionRevisionApplies: (revision: string) => boolean
}
export type OutputBodyCounter = (
  input: Pick<FullMeterInput, 'body' | 'serialized'>,
) => TokenMeasurement

function observation(group: PlanOutputHistoryGroup): OutputGroupSource {
  return {
    origin: group.origin,
    observation: {
      kind: 'observation',
      inputCalibration: group.inputCalibration,
      usage: group.usage,
      outputBlocks: group.outputBlocks,
      replaySelection: group.replaySelection,
    },
  }
}

function completeGroup(
  source: OutputGroupSource,
  spans: readonly Omit<HistorySelectionSpan, 'groupIndex'>[],
  units: readonly JsonValue[],
  indices: readonly number[],
  envelope: JsonObject,
  basis: NewMeterInput['countingBasis'],
  meter: InputMeter,
  policy: OutputHistoryPolicy,
  originalInput: object,
  projection?: InputProjection,
): { readonly index: number; readonly tokens: JsonNumber } | undefined {
  const original = source.observation
  const output = original.inputCalibration.outputGroup
  if (
    output.kind !== 'known' ||
    output.source !== 'reply' ||
    output.completeness !== 'complete' ||
    policy.projectionRevisionApplies(output.projectionRevision) !== true ||
    original.usage.source !== 'upstream' ||
    original.usage.output_tokens === 'unknown'
  )
    return undefined
  const request = original.inputCalibration.requestInput
  if (request.kind === 'known') {
    const relation = relateMeterBases(
      basis,
      request.countingBasis,
      meter,
      policy.originalBasisApplies(meter),
    )
    if (relation.kind !== 'sameEffective' && relation.kind !== 'changedEffective') return undefined
  }
  if (
    !source.origin &&
    (request.kind !== 'known' ||
      ExactDecimal.from(request.prefixBoundary).compare(ExactDecimal.from(indices[0] ?? -1)) !==
        0 ||
      request.inputEnvelopeDigest !==
        projectionDigest('input-envelope', envelope, request.projectionRevision))
  )
    return undefined
  if (policy.sourceApplies(source, meter, envelope) !== true) return undefined
  if (
    original.usage.reasoning_tokens !== undefined &&
    ExactDecimal.from(original.usage.reasoning_tokens).compare(
      ExactDecimal.from(original.usage.output_tokens),
    ) > 0
  )
    return undefined
  const selected = original.replaySelection
    .map((item, selectionIndex) => ({ ...item, selectionIndex }))
    .sort((a, b) => a.messageIndex - b.messageIndex || a.blockIndex - b.blockIndex)
  const first = selected[0]
  if (
    !first ||
    selected.length !== original.outputBlocks.length ||
    spans.length !== selected.length ||
    selected.some(
      (item, index) =>
        item.sourceBlockIndex !== index ||
        item.messageIndex !== first.messageIndex ||
        (index > 0 && item.blockIndex <= selected[index - 1]!.blockIndex),
    )
  )
    return undefined
  const start = spans[0]?.start
  if (start === undefined || spans.some(span => span.start !== start || span.end !== start + 1))
    return undefined
  const index = indices.indexOf(start)
  if (index < 0 || original.outputBlocks.some(block => !block.visibility.toModel)) return undefined
  const expected = projectAssistant(
    original.outputBlocks,
    meter.modelId,
    meter.provider === 'anthropic',
  )
  if (
    'rejected' in expected ||
    canonicalProjection(expected.message) !== canonicalProjection(units[index])
  )
    return undefined
  if (
    policy.requiresSignedPrefix(source, meter) &&
    !signedPrefixApplies(originalInput, source, start, projection)
  )
    return undefined
  return { index, tokens: original.usage.output_tokens }
}

function contributions(
  input: NewMeterInput,
  meter: InputMeter,
  policy: OutputHistoryPolicy,
  originalInput: object,
  projection?: InputProjection,
): { readonly units: readonly JsonValue[]; readonly output: ExactDecimal } | undefined {
  const classifications = input.units.map(unit => policy.classifyUnit(unit))
  if (classifications.some(kind => !['visible', 'wholeGroup'].includes(kind))) return undefined
  const replaced = new Set<number>()
  let output = ExactDecimal.from(0)
  for (const [groupIndex, group] of input.outputHistory.entries()) {
    const spans = input.historySpans.filter(span => span.groupIndex === groupIndex)
    const originalProjection = projectAssistant(
      group.outputBlocks,
      meter.modelId,
      meter.provider === 'anthropic',
    )
    if ('rejected' in originalProjection) return undefined
    const originalClass = policy.classifyUnit(originalProjection.message)
    if (!['visible', 'wholeGroup'].includes(originalClass)) return undefined
    if (
      originalClass !== 'wholeGroup' &&
      !spans.some(span => classifications[input.unitIndices.indexOf(span.start)] === 'wholeGroup')
    )
      continue
    const full = completeGroup(
      observation(group),
      spans,
      input.units,
      input.unitIndices,
      input.envelope,
      input.countingBasis,
      meter,
      policy,
      originalInput,
      projection,
    )
    if (!full || replaced.has(full.index)) return undefined
    replaced.add(full.index)
    output = output.add(ExactDecimal.from(full.tokens))
  }
  if (classifications.some((kind, index) => kind === 'wholeGroup' && !replaced.has(index)))
    return undefined
  return { units: input.units.filter((_, index) => !replaced.has(index)), output }
}
function addOutput(measured: MeterContribution, output: ExactDecimal): MeterContribution {
  if (!('tokens' in measured) || !meterContributionValid(measured)) return { kind: 'unavailable' }
  return output.compare(ExactDecimal.from(0)) === 0
    ? measured
    : {
        kind: 'estimated',
        tokens: ExactDecimal.from(measured.tokens).add(output).toJsonNumber(),
      }
}

/** Independently callable full input; a source observation never authenticates a projection. */
export function fullOutputHistory(
  input: FullMeterInput,
  meter: InputMeter,
  countBody: OutputBodyCounter,
  policy: OutputHistoryPolicy,
): TokenMeasurement {
  const identity = input
  const owned = ownFullOutputInput(input)
  if (!owned) return { kind: 'unavailable' }
  input = owned
  try {
    if (
      writeJsonLossless(input.body) !== input.serialized ||
      !fullProjectionValid(input) ||
      relateMeterBases(input.projection.requestInput.countingBasis, undefined, meter).kind !==
        'currentOnly' ||
      !meterHistoryValid(input.outputHistory, input.historySpans, input.projection.units.length)
    )
      return { kind: 'unavailable' }
    const selected = contributions(
      {
        units: input.projection.units,
        envelope: input.projection.envelope,
        precedingUnitCount: 0,
        unitIndices: input.projection.units.map((_, i) => i),
        countingBasis: input.projection.requestInput.countingBasis,
        outputHistory: input.outputHistory,
        historySpans: input.historySpans,
      },
      meter,
      policy,
      identity,
      input.projection,
    )
    if (!selected) return { kind: 'unavailable' }
    if (selected.units.length === input.projection.units.length)
      return countBody({
        body: { ...input.projection.envelope, messages: input.projection.units },
        serialized: writeJsonLossless({
          ...input.projection.envelope,
          messages: input.projection.units,
        }),
      })
    const body: JsonObject = { ...input.projection.envelope, messages: selected.units }
    const result = addOutput(
      countBody({ body, serialized: writeJsonLossless(body) }),
      selected.output,
    )
    return result.kind === 'invalidInput' ? { kind: 'unavailable' } : result
  } catch {
    return { kind: 'unavailable' }
  }
}

export function newOutputHistory(
  input: NewMeterInput,
  meter: InputMeter,
  countBody: OutputBodyCounter,
  policy: OutputHistoryPolicy,
): MeterContribution {
  const identity = input
  const owned = ownNewOutputInput(input)
  if (!owned) return { kind: 'invalidInput' }
  input = owned
  try {
    if (!marginalValid(input)) return { kind: 'invalidInput' }
    const relation = relateMeterBases(input.countingBasis, undefined, meter)
    if (relation.kind !== 'currentOnly')
      return { kind: relation.kind === 'invalidInput' ? 'invalidInput' : 'unavailable' }
    const selected = contributions(input, meter, policy, identity)
    return selected
      ? addOutput(fullJsonMarginal(countBody, { ...input, units: selected.units }), selected.output)
      : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  }
}
export function replayOutputHistory(
  input: ReplayMeterInput,
  meter: InputMeter,
  countBody: OutputBodyCounter,
  policy: OutputHistoryPolicy,
): MeterContribution {
  const identity = input
  const owned = ownReplayOutputInput(input)
  if (!owned) return { kind: 'invalidInput' }
  input = owned
  try {
    if (!meterReplayValid(input)) return { kind: 'invalidInput' }
    const original = input.observation.inputCalibration.requestInput
    if (
      original.kind !== 'known' ||
      input.observation.inputCalibration.observedInput.kind === 'unavailable'
    )
      return { kind: 'unavailable' }
    const relation = relateMeterBases(
      input.countingBasis,
      original.countingBasis,
      meter,
      policy.originalBasisApplies(meter),
    )
    if (relation.kind !== 'sameEffective')
      return { kind: relation.kind === 'invalidInput' ? 'invalidInput' : 'unavailable' }
    const classifications = input.units.map(unit => policy.classifyUnit(unit))
    if (classifications.some(kind => !['visible', 'wholeGroup'].includes(kind)))
      return { kind: 'unavailable' }
    const originalProjection = projectAssistant(
      input.observation.outputBlocks,
      meter.modelId,
      meter.provider === 'anthropic',
    )
    if ('rejected' in originalProjection) return { kind: 'unavailable' }
    const originalClass = policy.classifyUnit(originalProjection.message)
    if (!['visible', 'wholeGroup'].includes(originalClass)) return { kind: 'unavailable' }
    if (originalClass !== 'wholeGroup' && !classifications.includes('wholeGroup'))
      return fullJsonMarginal(countBody, input)
    const source =
      input.outputHistory[0] === undefined
        ? { observation: input.observation }
        : observation(input.outputHistory[0])
    const complete = completeGroup(
      source,
      input.selectionSpans,
      input.units,
      input.unitIndices,
      input.envelope,
      input.countingBasis,
      meter,
      policy,
      identity,
    )
    if (!complete || input.units.length !== 1) return { kind: 'unavailable' }
    return { kind: 'estimated', tokens: complete.tokens }
  } catch {
    return { kind: 'unavailable' }
  }
}
function marginalValid(input: NewMeterInput): boolean {
  if (
    !ownBasis(input.countingBasis) ||
    !Array.isArray(input.units) ||
    !Array.isArray(input.unitIndices) ||
    input.units.length !== input.unitIndices.length ||
    !Number.isSafeInteger(input.precedingUnitCount) ||
    input.precedingUnitCount < 0
  )
    return false
  const indices = new Set<number>()
  let upper = input.precedingUnitCount
  for (const index of input.unitIndices) {
    if (!Number.isSafeInteger(index) || index < input.precedingUnitCount || indices.has(index))
      return false
    indices.add(index)
    upper = Math.max(upper, index + 1)
  }
  return meterHistoryValid(input.outputHistory, input.historySpans, upper, indices)
}
/** Verify the same configured normalization, not raw body/units equality. */
function fullProjectionValid(input: FullMeterInput): boolean {
  const request = input.projection.requestInput
  if (
    request.projectionRevision !== INPUT_PROJECTION_REVISION ||
    ExactDecimal.from(request.prefixBoundary).compare(
      ExactDecimal.from(input.projection.units.length),
    ) !== 0 ||
    request.prefixDigest !== projectionDigest('input-prefix', input.projection.units) ||
    request.inputEnvelopeDigest !== projectionDigest('input-envelope', input.projection.envelope)
  )
    return false
  const body = ownedObject(input.body)
  if (!body) return false
  const neutral = cacheNeutralBody(body, input.projection.requestInput.countingBasis)
  const { messages, ...envelope } = neutral
  return (
    canonicalProjection(messages) === canonicalProjection(input.projection.units) &&
    canonicalProjection(envelope) === canonicalProjection(input.projection.envelope)
  )
}
