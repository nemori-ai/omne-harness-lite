import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  readOpaqueJson,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { CountingBasis } from '@omne-harness-lite/model-response'
import type { PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import { meterHistoryValid } from '../history-projection.ts'
import { canonicalProjection, INPUT_PROJECTION_REVISION } from '../projection.ts'
import {
  meterContributionValid,
  type FullMeterInput,
  type InputMeter,
  type MeterContribution,
  type NewMeterInput,
  type TokenMeasurement,
} from '../input-meter.ts'
import { object } from '../json.ts'
import { fullJsonMarginal } from './marginal.ts'
import { estimateOpenAi56Group } from './openai-replay.ts'
import { inspectCurrentMeterBasis } from '../meter-transform.ts'

type BodyCounter = (input: Pick<FullMeterInput, 'body' | 'serialized'>) => TokenMeasurement
function basisMatches(basis: CountingBasis, meter: InputMeter): boolean {
  return inspectCurrentMeterBasis(basis, meter).kind === 'known'
}
function encrypted(group: PlanOutputHistoryGroup): boolean {
  return group.outputBlocks.some(block => {
    if (block.kind !== 'thinking' || block.opaque === undefined) return false
    const opaque = readOpaqueJson(block.opaque)
    return (
      object(opaque) &&
      Array.isArray(opaque.reasoning_details) &&
      opaque.reasoning_details.some(
        detail => object(detail) && detail.type === 'reasoning.encrypted',
      )
    )
  })
}

/** Whole-unit replacement is a metering projection only. Source blocks and wire remain intact. */
function coveredUnits(
  input: Pick<
    NewMeterInput,
    'units' | 'unitIndices' | 'envelope' | 'outputHistory' | 'historySpans'
  >,
  meter: InputMeter,
): { units: readonly JsonValue[]; tokens: ExactDecimal } | undefined {
  let total = ExactDecimal.from(0)
  const replaced = new Set<number>()
  for (const [groupIndex, group] of input.outputHistory.entries()) {
    if (!encrypted(group)) continue
    const spans = input.historySpans.filter(span => span.groupIndex === groupIndex)
    const index = spans[0]?.start
    if (index === undefined || replaced.has(index)) return undefined
    const position = input.unitIndices.indexOf(index)
    if (position < 0) return undefined
    const unit = input.units[position]
    if (unit === undefined) return undefined
    const contribution = estimateOpenAi56Group(
      {
        observation: {
          kind: 'observation',
          inputCalibration: group.inputCalibration,
          usage: group.usage,
          outputBlocks: group.outputBlocks,
          replaySelection: group.replaySelection,
        },
        envelope: input.envelope,
        units: [unit],
        unitIndices: [index],
        selectionSpans: spans.map(({ selectionIndex, start, end }) => ({
          selectionIndex,
          start,
          end,
        })),
        history: group,
      },
      meter,
    )
    if (contribution.kind !== 'estimated') return undefined
    replaced.add(index)
    total = total.add(ExactDecimal.from(contribution.tokens))
  }
  const remaining: JsonValue[] = []
  for (const [position, unit] of input.units.entries()) {
    const index = input.unitIndices[position]
    if (index === undefined) return undefined
    if (!replaced.has(index)) remaining.push(unit)
  }
  return { units: remaining, tokens: total }
}
function combined(visible: MeterContribution, output: ExactDecimal): MeterContribution {
  if (
    visible.kind === 'unavailable' ||
    visible.kind === 'invalidInput' ||
    !meterContributionValid(visible)
  )
    return { kind: 'unavailable' }
  return { kind: 'estimated', tokens: ExactDecimal.from(visible.tokens).add(output).toJsonNumber() }
}

export function fullOpenAi56History(
  input: FullMeterInput,
  meter: InputMeter,
  countBody: BodyCounter,
): TokenMeasurement {
  try {
    // Reject non-data inputs before a public independent call reads their members.
    if ('failed' in copyJsonValue(input)) return { kind: 'unavailable' }
    const { messages, ...envelope } = input.body
    const units = input.projection.units
    if (
      writeJsonLossless(input.body) !== input.serialized ||
      !Array.isArray(messages) ||
      canonicalProjection(messages) !== canonicalProjection(units) ||
      canonicalProjection(envelope) !== canonicalProjection(input.projection.envelope) ||
      !basisMatches(input.projection.requestInput.countingBasis, meter) ||
      !meterHistoryValid(input.outputHistory, input.historySpans, units.length)
    )
      return { kind: 'unavailable' }
    const covered = coveredUnits(
      { ...input, units, unitIndices: units.map((_, i) => i), envelope },
      meter,
    )
    if (!covered) return { kind: 'unavailable' }
    if (covered.units.length === units.length) return countBody(input)
    const body: JsonObject = { ...envelope, messages: covered.units }
    const total = combined(countBody({ body, serialized: writeJsonLossless(body) }), covered.tokens)
    return total.kind === 'invalidInput' ? { kind: 'unavailable' } : total
  } catch {
    return { kind: 'unavailable' }
  }
}
export function newOpenAi56History(
  input: NewMeterInput,
  meter: InputMeter,
  countBody: BodyCounter,
): MeterContribution {
  try {
    if ('failed' in copyJsonValue(input)) return { kind: 'invalidInput' }
    const indices = new Set(input.unitIndices)
    if (
      indices.size !== input.units.length ||
      input.unitIndices.length !== input.units.length ||
      !Number.isSafeInteger(input.precedingUnitCount) ||
      input.precedingUnitCount < 0 ||
      input.unitIndices.some(
        index => !Number.isSafeInteger(index) || index < input.precedingUnitCount,
      ) ||
      !meterHistoryValid(
        input.outputHistory,
        input.historySpans,
        input.unitIndices.reduce(
          (upper, index) => Math.max(upper, index + 1),
          input.precedingUnitCount,
        ),
        indices,
      )
    )
      return { kind: 'invalidInput' }
    if (!basisMatches(input.countingBasis, meter)) return { kind: 'unavailable' }
    const covered = coveredUnits(input, meter)
    if (!covered) return { kind: 'unavailable' }
    if (!input.units.length) return { kind: 'exact', tokens: 0 }
    return combined(fullJsonMarginal(countBody, { ...input, units: covered.units }), covered.tokens)
  } catch {
    return { kind: 'invalidInput' }
  }
}
