import { copyJsonValue, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import { copyInputCalibration } from '@omne-harness-lite/model-response'
import {
  judgeModelProfileDocument,
  validate,
  type ModelAdaptationBinding,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import type { PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import { ownCalibration } from '../calibration.ts'
import { object } from '../json.ts'
import { ownBasis } from '../meter-transform.ts'
import type {
  FullMeterInput,
  NewMeterInput,
  ReplayMeterInput,
  HistorySelectionSpan,
  MarginalMeterInput,
} from '../input-meter.ts'

function frozen(value: JsonValue): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child)
    Object.freeze(value)
  }
}
function snapshot(raw: unknown): JsonObject | undefined {
  const copied = copyJsonValue(raw)
  if ('failed' in copied || !object(copied.ok)) return undefined
  frozen(copied.ok)
  return copied.ok
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function adaptation(value: unknown): value is ModelAdaptationBinding {
  return validate('ModelAdaptationBinding', value).valid
}
function requestParameters(value: unknown): value is ModelRequestParameters {
  return 'ok' in judgeModelProfileDocument('ModelRequestParameters', value)
}
function history(raw: JsonValue | undefined): readonly PlanOutputHistoryGroup[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const result: PlanOutputHistoryGroup[] = []
  for (const group of raw) {
    if (!object(group) || Object.keys(group).length !== 5 || !object(group.origin)) return undefined
    const observed = ownCalibration({
      kind: 'observation',
      inputCalibration: group.inputCalibration,
      usage: group.usage,
      outputBlocks: group.outputBlocks,
      replaySelection: group.replaySelection,
    })
    const origin = group.origin
    const binding = origin.adaptation
    const parameters = origin.parameters
    if (
      !observed ||
      observed.kind !== 'observation' ||
      !adaptation(binding) ||
      !requestParameters(parameters) ||
      typeof origin.provider !== 'string' ||
      !validate('ProviderName', origin.provider).valid ||
      (origin.servingProvider !== undefined && typeof origin.servingProvider !== 'string') ||
      (origin.upstreamModel !== undefined && typeof origin.upstreamModel !== 'string') ||
      Object.keys(origin).some(
        key =>
          !['adaptation', 'provider', 'parameters', 'servingProvider', 'upstreamModel'].includes(
            key,
          ),
      )
    )
      return undefined
    result.push(
      Object.freeze({
        inputCalibration: observed.inputCalibration,
        usage: observed.usage,
        outputBlocks: observed.outputBlocks,
        replaySelection: observed.replaySelection,
        origin: Object.freeze({
          adaptation: binding,
          parameters,
          provider: origin.provider,
          ...(origin.servingProvider === undefined
            ? {}
            : { servingProvider: origin.servingProvider }),
          ...(origin.upstreamModel === undefined ? {} : { upstreamModel: origin.upstreamModel }),
        }),
      }),
    )
  }
  return Object.freeze(result)
}
function spans(raw: JsonValue | undefined): readonly HistorySelectionSpan[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const result: HistorySelectionSpan[] = []
  for (const value of raw) {
    if (
      !object(value) ||
      Object.keys(value).length !== 4 ||
      !integer(value.groupIndex) ||
      !integer(value.selectionIndex) ||
      !integer(value.start) ||
      !integer(value.end)
    )
      return undefined
    result.push(
      Object.freeze({
        groupIndex: value.groupIndex,
        selectionIndex: value.selectionIndex,
        start: value.start,
        end: value.end,
      }),
    )
  }
  return Object.freeze(result)
}
function marginal(value: JsonObject): MarginalMeterInput | undefined {
  if (
    !Array.isArray(value.units) ||
    !object(value.envelope) ||
    !integer(value.precedingUnitCount) ||
    (value.boundary !== undefined && !object(value.boundary))
  )
    return undefined
  return {
    units: value.units,
    envelope: value.envelope,
    precedingUnitCount: value.precedingUnitCount,
    ...(value.boundary === undefined ? {} : { boundary: value.boundary }),
  }
}
export function ownFullOutputInput(raw: unknown): FullMeterInput | undefined {
  const value = snapshot(raw)
  if (
    !value ||
    !object(value.body) ||
    typeof value.serialized !== 'string' ||
    !object(value.projection) ||
    !Array.isArray(value.projection.units) ||
    !object(value.projection.envelope)
  )
    return undefined
  const calibration = copyInputCalibration({
    requestInput: value.projection.requestInput,
    observedInput: { kind: 'unavailable', reason: 'missing_usage' },
    outputGroup: { kind: 'unavailable', reason: 'not_retained' },
  })
  const groups = history(value.outputHistory),
    selected = spans(value.historySpans)
  if (
    'rejected' in calibration ||
    calibration.ok.requestInput.kind !== 'known' ||
    !groups ||
    !selected
  )
    return undefined
  return Object.freeze({
    body: value.body,
    serialized: value.serialized,
    projection: Object.freeze({
      units: value.projection.units,
      envelope: value.projection.envelope,
      requestInput: calibration.ok.requestInput,
    }),
    outputHistory: groups,
    historySpans: selected,
  })
}
export function ownNewOutputInput(raw: unknown): NewMeterInput | undefined {
  const value = snapshot(raw)
  if (!value || !Array.isArray(value.unitIndices) || !value.unitIndices.every(integer))
    return undefined
  const base = marginal(value),
    basis = ownBasis(value.countingBasis),
    groups = history(value.outputHistory),
    selected = spans(value.historySpans)
  if (!base || !basis || !groups || !selected) return undefined
  return Object.freeze({
    ...base,
    countingBasis: basis,
    unitIndices: value.unitIndices,
    outputHistory: groups,
    historySpans: selected,
  })
}
export function ownReplayOutputInput(raw: unknown): ReplayMeterInput | undefined {
  const value = snapshot(raw)
  if (
    !value ||
    !Array.isArray(value.unitIndices) ||
    !value.unitIndices.every(integer) ||
    !Array.isArray(value.selectionSpans)
  )
    return undefined
  const base = marginal(value),
    basis = ownBasis(value.countingBasis),
    groups = history(value.outputHistory),
    observation = ownCalibration(value.observation)
  if (!base || !basis || !groups || !observation || observation.kind !== 'observation')
    return undefined
  const selected: ReplayMeterInput['selectionSpans'][number][] = []
  for (const span of value.selectionSpans) {
    if (
      !object(span) ||
      Object.keys(span).length !== 3 ||
      !integer(span.selectionIndex) ||
      !integer(span.start) ||
      !integer(span.end)
    )
      return undefined
    selected.push(
      Object.freeze({ selectionIndex: span.selectionIndex, start: span.start, end: span.end }),
    )
  }
  return Object.freeze({
    ...base,
    countingBasis: basis,
    unitIndices: value.unitIndices,
    observation,
    outputHistory: groups,
    selectionSpans: Object.freeze(selected),
  })
}
