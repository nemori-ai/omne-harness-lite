import type { PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import { ExactDecimal, judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { judgeContentBlock } from '@omne-harness-lite/content-blocks'
import { copyInputCalibration } from '@omne-harness-lite/model-response'
import {
  judgeModelProfileDocument,
  validate as validateProfile,
} from '@omne-harness-lite/model-profile'
import {
  canonicalProjection,
  INPUT_PROJECTION_REVISION,
  outputBlockDigest,
  type InputProjection,
} from './projection.ts'
import type { HistorySelectionSpan } from './input-meter.ts'
import type { ReplayMeterInput } from './input-meter.ts'

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
        digest === outputBlockDigest(group.outputBlocks[index], output.projectionRevision),
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
    if (
      !origin ||
      typeof origin !== 'object' ||
      Object.keys(origin).some(
        key =>
          !['adaptation', 'provider', 'parameters', 'servingProvider', 'upstreamModel'].includes(
            key,
          ),
      ) ||
      !validateProfile('ModelAdaptationBinding', origin.adaptation).valid ||
      !validateProfile('ProviderName', origin.provider).valid ||
      !('ok' in judgeModelProfileDocument('ModelRequestParameters', origin.parameters)) ||
      (origin.servingProvider !== undefined &&
        (typeof origin.servingProvider !== 'string' || !origin.servingProvider)) ||
      (origin.upstreamModel !== undefined &&
        (typeof origin.upstreamModel !== 'string' || !origin.upstreamModel))
    )
      return false
    const original = calibration.ok.requestInput
    const output = calibration.ok.outputGroup
    if (output.kind !== 'known' || (output.source === 'none' && group.replaySelection.length))
      return false
    if (
      original.kind === 'known' &&
      (original.countingBasis.model !== origin.adaptation.definition.modelId ||
        original.countingBasis.provider !== origin.provider ||
        canonicalProjection(original.countingBasis.binding) !==
          canonicalProjection(origin.adaptation) ||
        original.projectionRevision !== output.projectionRevision)
    )
      return false
    const observed = calibration.ok.observedInput
    if (
      observed.kind !== 'unavailable' &&
      ((origin.upstreamModel !== undefined &&
        observed.provenance.upstreamModel !== undefined &&
        origin.upstreamModel !== observed.provenance.upstreamModel) ||
        (origin.servingProvider !== undefined &&
          observed.provenance.servingProvider !== undefined &&
          origin.servingProvider !== observed.provenance.servingProvider))
    )
      return false
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
  } catch {
    return false
  }
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
        span === undefined ||
        !Number.isSafeInteger(span.start) ||
        !Number.isSafeInteger(span.end) ||
        span.start < 0 ||
        span.start >= span.end ||
        span.end > projection.units.length
      )
        return undefined
      targets.add(key)
      result.push(Object.freeze({ groupIndex, selectionIndex, start: span.start, end: span.end }))
    }
  }
  return Object.freeze(result)
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
  let expected = 0
  const targets = new Set<string>()
  const expectedViews: string[] = []
  for (const [groupIndex, group] of groups.entries()) {
    const output = group?.inputCalibration?.outputGroup
    if (
      output?.kind !== 'known' ||
      !Array.isArray(group.outputBlocks) ||
      !Array.isArray(group.replaySelection) ||
      !Array.isArray(output.blockDigests) ||
      output.blockDigests.length !== group.outputBlocks.length
    )
      return false
    if (!groupFactsValid(group) || !knownDigestsMatch(group)) return false
    for (const [selectionIndex, selected] of group.replaySelection.entries()) {
      if (
        !Number.isSafeInteger(selected.sourceBlockIndex) ||
        selected.sourceBlockIndex < 0 ||
        selected.sourceBlockIndex >= group.outputBlocks.length ||
        !Number.isSafeInteger(selected.messageIndex) ||
        selected.messageIndex < 0 ||
        !Number.isSafeInteger(selected.blockIndex) ||
        selected.blockIndex < 0
      )
        return false
      const key = `${selected.messageIndex}:${selected.blockIndex}`
      if (targets.has(key)) return false
      targets.add(key)
      expectedViews.push(`${groupIndex}:${selectionIndex}`)
      expected++
    }
  }
  if (spans.length !== expected) return false
  const views = new Set<string>()
  for (const [position, span] of spans.entries()) {
    if (!span || typeof span !== 'object') return false
    const group = groups[span.groupIndex]
    if (
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
      return false
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

/** Public replay calls do not inherit the planner's owned-source checks. */
export function meterReplayValid(input: ReplayMeterInput): boolean {
  try {
    if (
      !Array.isArray(input.outputHistory) ||
      input.outputHistory.length > 1 ||
      !Array.isArray(input.units) ||
      !Array.isArray(input.unitIndices) ||
      input.units.length !== input.unitIndices.length ||
      !Array.isArray(input.selectionSpans) ||
      !Number.isSafeInteger(input.precedingUnitCount) ||
      input.precedingUnitCount < 0
    )
      return false
    const observed = input.observation
    const group = observed?.inputCalibration?.outputGroup
    if (
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
      return false
    const targets = new Set<string>()
    for (const selection of observed.replaySelection) {
      if (
        !Number.isSafeInteger(selection.sourceBlockIndex) ||
        selection.sourceBlockIndex < 0 ||
        selection.sourceBlockIndex >= observed.outputBlocks.length ||
        !Number.isSafeInteger(selection.messageIndex) ||
        selection.messageIndex < 0 ||
        !Number.isSafeInteger(selection.blockIndex) ||
        selection.blockIndex < 0
      )
        return false
      const key = `${selection.messageIndex}:${selection.blockIndex}`
      if (targets.has(key)) return false
      targets.add(key)
    }
    let upper = input.precedingUnitCount
    const indices = new Set<number>()
    for (const index of input.unitIndices) {
      if (!Number.isSafeInteger(index) || index < input.precedingUnitCount || indices.has(index))
        return false
      indices.add(index)
      upper = Math.max(upper, index + 1)
    }
    const original = input.outputHistory[0]
    if (
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
      return false
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
  } catch {
    return false
  }
}
