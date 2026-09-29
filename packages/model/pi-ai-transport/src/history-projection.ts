import type { PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import { INPUT_PROJECTION_REVISION, outputBlockDigest, type InputProjection } from './projection.ts'
import type { HistorySelectionSpan } from './input-meter.ts'

export interface MessageSpan {
  readonly start: number
  readonly end: number
}

function knownDigestsMatch(group: PlanOutputHistoryGroup): boolean {
  const output = group.inputCalibration.outputGroup
  if (output.kind !== 'known') return false
  if (output.projectionRevision !== INPUT_PROJECTION_REVISION) return true
  try {
    return output.blockDigests.every(
      (digest, index) => digest === outputBlockDigest(group.outputBlocks[index]),
    )
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
    if (!knownDigestsMatch(group)) return false
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
