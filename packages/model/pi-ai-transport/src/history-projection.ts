import type { PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import { ExactDecimal, judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { judgeContentBlock } from '@omne-harness-lite/content-blocks'
import { copyInputCalibration } from '@omne-harness-lite/model-response'
import {
  judgeModelProfileDocument,
  validate as validateProfile,
} from '@omne-harness-lite/model-profile'
import { canonicalProjection, INPUT_PROJECTION_REVISION, outputBlockDigestAtRevision } from './projection.ts'
import { type InputProjection } from '@omne-harness-lite/model-request-runtime'
import type { HistorySelectionSpan } from '@omne-harness-lite/model-request-runtime'
import type { ReplayMeterInput } from '@omne-harness-lite/model-request-runtime'

export interface MessageSpan {
  readonly start: number
  readonly end: number
}

function knownDigestsMatch(
  group: Pick<PlanOutputHistoryGroup, 'inputCalibration' | 'outputBlocks'>,
): boolean {
  const output = group.inputCalibration.outputGroup
  if (output.kind !== 'known') return false
  if (
    ![INPUT_PROJECTION_REVISION, 'openrouter-input-projection/2'].includes(
      output.projectionRevision,
    )
  )
    return true
  try {
    return output.blockDigests.every(
      (digest, index) =>
        digest ===
        outputBlockDigestAtRevision(group.outputBlocks[index], output.projectionRevision),
    )
  } catch {
    return false
  }
}

/** Relations independently checkable from an original group, without a service prefix. */
function groupFactsValid(group: PlanOutputHistoryGroup): boolean {
  try {
    const calibration = copyInputCalibration(group.inputCalibration)
    if (!('ok' in calibration) || !('ok' in judgeAccountValue('Usage', group.usage))) return false
    if (group.outputBlocks.some(block => !('ok' in judgeContentBlock(block)))) return false
    const origin = group.origin
    if (!historyOriginValid(origin)) return false
    const original = calibration.ok.requestInput
    const output = calibration.ok.outputGroup
    if (output.kind !== 'known' || (output.source === 'none' && group.replaySelection.length))
      return false
    if (!originBasisValid(original, origin, output)) return false
    const observed = calibration.ok.observedInput
    if (!observedOriginValid(observed, origin)) return false
    return observedUsageValid(group, observed)
  } catch {
    return false
  }
}
function historyOriginValid(origin: PlanOutputHistoryGroup['origin']): boolean {
  return !(
    !origin ||
    typeof origin !== 'object' ||
    Object.keys(origin).some(
      key =>
        !['adaptation', 'provider', 'parameters', 'servingProvider', 'upstreamModel'].includes(key),
    ) ||
    !validateProfile('ModelAdaptationBinding', origin.adaptation).valid ||
    !validateProfile('ProviderName', origin.provider).valid ||
    !('ok' in judgeModelProfileDocument('ModelRequestParameters', origin.parameters)) ||
    !originReportValid(origin)
  )
}
function originReportValid(origin: PlanOutputHistoryGroup['origin']): boolean {
  return !(
    (origin.servingProvider !== undefined &&
      (typeof origin.servingProvider !== 'string' || !origin.servingProvider)) ||
    (origin.upstreamModel !== undefined &&
      (typeof origin.upstreamModel !== 'string' || !origin.upstreamModel))
  )
}
function originBasisValid(
  original: PlanOutputHistoryGroup['inputCalibration']['requestInput'],
  origin: PlanOutputHistoryGroup['origin'],
  output: Extract<PlanOutputHistoryGroup['inputCalibration']['outputGroup'], { kind: 'known' }>,
): boolean {
  return !(
    original.kind === 'known' &&
    (original.countingBasis.model !== origin.adaptation.definition.modelId ||
      original.countingBasis.provider !== origin.provider ||
      canonicalProjection(original.countingBasis.binding) !==
        canonicalProjection(origin.adaptation) ||
      original.projectionRevision !== output.projectionRevision)
  )
}
function observedOriginValid(
  observed: PlanOutputHistoryGroup['inputCalibration']['observedInput'],
  origin: PlanOutputHistoryGroup['origin'],
): boolean {
  return !(
    observed.kind !== 'unavailable' &&
    ((origin.upstreamModel !== undefined &&
      observed.provenance.upstreamModel !== undefined &&
      origin.upstreamModel !== observed.provenance.upstreamModel) ||
      (origin.servingProvider !== undefined &&
        observed.provenance.servingProvider !== undefined &&
        origin.servingProvider !== observed.provenance.servingProvider))
  )
}
function observedUsageValid(
  group: PlanOutputHistoryGroup,
  observed: PlanOutputHistoryGroup['inputCalibration']['observedInput'],
): boolean {
  const parts = [
    group.usage.input_tokens,
    group.usage.cache_read_tokens,
    group.usage.cache_write_tokens,
  ]
  if (
    observed.kind === 'from_usage' &&
    (group.usage.source !== 'upstream' || parts.some(part => part === 'unknown'))
  )
    return false
  if (
    observed.kind === 'upstream_total' &&
    (parts.every(part => part !== 'unknown') ||
      parts
        .reduce(
          (sum, part) => (part === 'unknown' ? sum : sum.add(ExactDecimal.from(part))),
          ExactDecimal.from(0),
        )
        .compare(ExactDecimal.from(observed.tokens)) > 0)
  )
    return false
  return true
}

/** A position view of the one final request projection, without a second source DTO. */
export function projectHistorySpans(
  groups: readonly PlanOutputHistoryGroup[],
  projection: InputProjection,
  messages: readonly MessageSpan[],
): readonly HistorySelectionSpan[] | undefined {
  const result: HistorySelectionSpan[] = []
  const targets = new Set<string>()
  for (const [groupIndex, group] of groups.entries()) {
    const output = group.inputCalibration.outputGroup
    if (output.kind !== 'known' || output.blockDigests.length !== group.outputBlocks.length)
      return undefined
    if (!knownDigestsMatch(group)) return undefined
    for (const [selectionIndex, selected] of group.replaySelection.entries()) {
      const span = messages[selected.messageIndex]
      const key = `${selected.messageIndex}:${selected.blockIndex}`
      if (
        targets.has(key) ||
        selected.sourceBlockIndex >= group.outputBlocks.length ||
        !projectedSpanValid(span, projection)
      )
        return undefined
      targets.add(key)
      result.push(Object.freeze({ groupIndex, selectionIndex, start: span.start, end: span.end }))
    }
  }
  return Object.freeze(result)
}
function projectedSpanValid(
  span: MessageSpan | undefined,
  projection: InputProjection,
): span is MessageSpan {
  return !(
    span === undefined ||
    !Number.isSafeInteger(span.start) ||
    !Number.isSafeInteger(span.end) ||
    span.start < 0 ||
    span.start >= span.end ||
    span.end > projection.units.length
  )
}

/** Public meter arguments can check spans, group uniqueness and known revision summaries. */
export function meterHistoryValid(
  groups: readonly PlanOutputHistoryGroup[],
  spans: readonly HistorySelectionSpan[],
  finalUnitCount: number,
  allowedUnitIndices?: ReadonlySet<number>,
): boolean {
  if (
    !Array.isArray(groups) ||
    !Array.isArray(spans) ||
    !Number.isSafeInteger(finalUnitCount) ||
    finalUnitCount < 0
  )
    return false
  const expectedViews = collectHistoryViews(groups)
  if (!expectedViews) return false
  return historyViewsValid(groups, spans, finalUnitCount, allowedUnitIndices, expectedViews)
}
function collectHistoryViews(groups: readonly PlanOutputHistoryGroup[]): string[] | undefined {
  const targets = new Set<string>()
  const expectedViews: string[] = []
  for (const [groupIndex, group] of groups.entries()) {
    const output = group?.inputCalibration?.outputGroup
    if (!historyGroupShape(group, output)) return undefined
    if (!groupFactsValid(group) || !knownDigestsMatch(group)) return undefined
    for (const [selectionIndex, selected] of group.replaySelection.entries()) {
      if (!selectionBoundsValid(selected, group)) return undefined
      const key = `${selected.messageIndex}:${selected.blockIndex}`
      if (targets.has(key)) return undefined
      targets.add(key)
      expectedViews.push(`${groupIndex}:${selectionIndex}`)
    }
  }
  return expectedViews
}
function historyGroupShape(
  group: PlanOutputHistoryGroup,
  output: PlanOutputHistoryGroup['inputCalibration']['outputGroup'] | undefined,
): boolean {
  return !(
    output?.kind !== 'known' ||
    !Array.isArray(group.outputBlocks) ||
    !Array.isArray(group.replaySelection) ||
    !Array.isArray(output.blockDigests) ||
    output.blockDigests.length !== group.outputBlocks.length
  )
}
function selectionBoundsValid(
  selected: PlanOutputHistoryGroup['replaySelection'][number],
  group: Pick<PlanOutputHistoryGroup, 'outputBlocks'>,
): boolean {
  return !(
    !Number.isSafeInteger(selected.sourceBlockIndex) ||
    selected.sourceBlockIndex < 0 ||
    selected.sourceBlockIndex >= group.outputBlocks.length ||
    !Number.isSafeInteger(selected.messageIndex) ||
    selected.messageIndex < 0 ||
    !Number.isSafeInteger(selected.blockIndex) ||
    selected.blockIndex < 0
  )
}
function historyViewsValid(
  groups: readonly PlanOutputHistoryGroup[],
  spans: readonly HistorySelectionSpan[],
  finalUnitCount: number,
  allowedUnitIndices: ReadonlySet<number> | undefined,
  expectedViews: readonly string[],
): boolean {
  if (spans.length !== expectedViews.length) return false
  const views = new Set<string>()
  for (const [position, span] of spans.entries()) {
    if (!span || typeof span !== 'object') return false
    const group = groups[span.groupIndex]
    if (!historySpanValid(span, group, finalUnitCount)) return false
    const key = `${span.groupIndex}:${span.selectionIndex}`
    if (views.has(key) || key !== expectedViews[position]) return false
    views.add(key)
    if (allowedUnitIndices !== undefined) {
      for (let index = span.start; index < span.end; index++) {
        if (!allowedUnitIndices.has(index)) return false
      }
    }
  }
  return true
}
function historySpanValid(
  span: HistorySelectionSpan,
  group: PlanOutputHistoryGroup | undefined,
  finalUnitCount: number,
): boolean {
  return !(
    group === undefined ||
    !Number.isSafeInteger(span.selectionIndex) ||
    span.selectionIndex < 0 ||
    span.selectionIndex >= group.replaySelection.length ||
    !Number.isSafeInteger(span.start) ||
    !Number.isSafeInteger(span.end) ||
    span.start < 0 ||
    span.start >= span.end ||
    span.end > finalUnitCount
  )
}

/** Public replay calls do not inherit the planner's owned-source checks. */
export function meterReplayValid(input: ReplayMeterInput): boolean {
  try {
    if (!replayInputShape(input)) return false
    const observed = input.observation
    const group = observed?.inputCalibration?.outputGroup
    if (!replayObservationValid(input, observed, group)) return false
    if (!replayTargetsValid(observed)) return false
    const extent = replayExtent(input)
    if (!extent) return false
    const { upper, indices } = extent
    const original = input.outputHistory[0]
    if (!replayHistoryMatches(input, original, observed, upper, indices)) return false
    return replaySpansValid(input, observed, indices)
  } catch {
    return false
  }
}
function replayInputShape(input: ReplayMeterInput): boolean {
  return !(
    !Array.isArray(input.outputHistory) ||
    input.outputHistory.length > 1 ||
    !Array.isArray(input.units) ||
    !Array.isArray(input.unitIndices) ||
    input.units.length !== input.unitIndices.length ||
    !Array.isArray(input.selectionSpans) ||
    !Number.isSafeInteger(input.precedingUnitCount) ||
    input.precedingUnitCount < 0
  )
}
function replayObservationValid(
  input: ReplayMeterInput,
  observed: ReplayMeterInput['observation'],
  group: ReplayMeterInput['observation']['inputCalibration']['outputGroup'] | undefined,
): boolean {
  return !(
    observed?.kind !== 'observation' ||
    (group?.kind !== 'known' && group?.kind !== 'unavailable') ||
    !Array.isArray(observed.outputBlocks) ||
    !Array.isArray(observed.replaySelection) ||
    input.selectionSpans.length !== observed.replaySelection.length ||
    (group.kind === 'known' &&
      (group.blockDigests.length !== observed.outputBlocks.length ||
        !knownDigestsMatch({
          inputCalibration: observed.inputCalibration,
          outputBlocks: observed.outputBlocks,
        }))) ||
    (group.kind === 'unavailable' && input.outputHistory.length !== 0)
  )
}
function replayTargetsValid(observed: ReplayMeterInput['observation']): boolean {
  const targets = new Set<string>()
  for (const selection of observed.replaySelection) {
    if (!selectionBoundsValid(selection, observed)) return false
    const key = `${selection.messageIndex}:${selection.blockIndex}`
    if (targets.has(key)) return false
    targets.add(key)
  }
  return true
}
function replayExtent(
  input: ReplayMeterInput,
): { upper: number; indices: Set<number> } | undefined {
  let upper = input.precedingUnitCount
  const indices = new Set<number>()
  for (const index of input.unitIndices) {
    if (!Number.isSafeInteger(index) || index < input.precedingUnitCount || indices.has(index))
      return undefined
    indices.add(index)
    upper = Math.max(upper, index + 1)
  }
  return { upper, indices }
}
function replayHistoryMatches(
  input: ReplayMeterInput,
  original: PlanOutputHistoryGroup | undefined,
  observed: ReplayMeterInput['observation'],
  upper: number,
  indices: ReadonlySet<number>,
): boolean {
  return !(
    original !== undefined &&
    (canonicalProjection({
      kind: 'observation',
      inputCalibration: original.inputCalibration,
      usage: original.usage,
      outputBlocks: original.outputBlocks,
      replaySelection: original.replaySelection,
    }) !== canonicalProjection(observed) ||
      !meterHistoryValid(
        [original],
        input.selectionSpans.map(span => ({ groupIndex: 0, ...span })),
        upper,
        indices,
      ))
  )
}
function replaySpansValid(
  input: ReplayMeterInput,
  observed: ReplayMeterInput['observation'],
  indices: ReadonlySet<number>,
): boolean {
  for (const [position, span] of input.selectionSpans.entries()) {
    if (
      span.selectionIndex !== position ||
      span.selectionIndex >= observed.replaySelection.length ||
      !Number.isSafeInteger(span.start) ||
      !Number.isSafeInteger(span.end) ||
      span.start < input.precedingUnitCount ||
      span.start >= span.end
    )
      return false
    for (let index = span.start; index < span.end; index++) {
      if (!indices.has(index)) return false
    }
  }
  return true
}
