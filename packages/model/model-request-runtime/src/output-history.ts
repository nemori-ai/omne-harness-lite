import { ExactDecimal, judgeAccountValue, type Usage } from '@omne-harness-lite/call-accounts'
import { copyJsonValue, type ContentBlock } from '@omne-harness-lite/content-blocks'
import type { Message } from '@omne-harness-lite/messages'
import {
  judgeModelProfileDocument,
  validate as validateProfile,
  type ModelAdaptationBinding,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import { copyInputCalibration, type InputCalibration } from '@omne-harness-lite/model-response'
import { modelLogJsonEqual } from './log-codec.ts'
import { copyPlanContentBlocks, copyPlanMessages } from './plan-input-values.ts'
import type { PlanCalibration, PlanOutputHistoryGroup, ReplaySelection } from './types.ts'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function index(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function selectionPosition(value: unknown): value is ReplaySelection {
  return (
    record(value) &&
    Object.keys(value).length === 3 &&
    index(value.sourceBlockIndex) &&
    index(value.messageIndex) &&
    index(value.blockIndex)
  )
}

function laterTarget(
  message: number,
  block: number,
  previousMessage: number,
  previousBlock: number,
): boolean {
  return !(message < previousMessage || (message === previousMessage && block <= previousBlock))
}

function copySelection(
  value: unknown,
  blocks: readonly ContentBlock[],
  messages: readonly Message[],
): readonly ReplaySelection[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const selected: ReplaySelection[] = []
  const targets = new Set<string>()
  let previousMessage = -1
  let previousBlock = -1
  for (const raw of value) {
    if (!selectionPosition(raw)) return undefined
    const { sourceBlockIndex, messageIndex, blockIndex } = raw
    const source = blocks[sourceBlockIndex]
    const target = messages[messageIndex]?.blocks[blockIndex]
    const key = `${messageIndex}:${blockIndex}`
    if (
      source === undefined ||
      target === undefined ||
      !target.visibility.toModel ||
      !modelLogJsonEqual(source, target) ||
      targets.has(key) ||
      !laterTarget(messageIndex, blockIndex, previousMessage, previousBlock)
    )
      return undefined
    selected.push(Object.freeze({ sourceBlockIndex, messageIndex, blockIndex }))
    targets.add(key)
    previousMessage = messageIndex
    previousBlock = blockIndex
  }
  return Object.freeze(selected)
}

function historyGroupShape(group: Record<string, unknown>): group is Record<string, unknown> & {
  readonly outputBlocks: readonly unknown[]
  readonly origin: Record<string, unknown>
} {
  return (
    Object.keys(group).length === 5 &&
    Object.hasOwn(group, 'inputCalibration') &&
    Object.hasOwn(group, 'usage') &&
    Object.hasOwn(group, 'outputBlocks') &&
    Object.hasOwn(group, 'replaySelection') &&
    Object.hasOwn(group, 'origin') &&
    Array.isArray(group.outputBlocks) &&
    record(group.origin)
  )
}

function captureHistoryGroup(raw: unknown) {
  const copied = copyJsonValue(raw)
  if (!('ok' in copied) || !record(copied.ok)) return undefined
  return historyGroupShape(copied.ok) ? copied.ok : undefined
}

function observedUsageMatches(source: InputCalibration, usage: Usage): boolean {
  const observedInput = source.observedInput
  const inputParts = [usage.input_tokens, usage.cache_read_tokens, usage.cache_write_tokens]
  return !(
    (observedInput.kind === 'from_usage' &&
      (usage.source !== 'upstream' || inputParts.some(part => part === 'unknown'))) ||
    (observedInput.kind === 'upstream_total' &&
      (inputParts.every(part => part !== 'unknown') ||
        inputParts
          .reduce(
            (sum, part) => (part === 'unknown' ? sum : sum.add(ExactDecimal.from(part))),
            ExactDecimal.from(0),
          )
          .compare(ExactDecimal.from(observedInput.tokens)) > 0))
  )
}

function groupSource(group: Record<string, unknown>) {
  const source = copyInputCalibration(group.inputCalibration)
  if (!('ok' in source) || source.ok.outputGroup.kind !== 'known') return undefined
  const usage = judgeAccountValue('Usage', group.usage)
  if (!('ok' in usage)) return undefined
  const originalUsage = group.usage as unknown as Usage
  if (!observedUsageMatches(source.ok, originalUsage)) return undefined
  return { calibration: source.ok, outputGroup: source.ok.outputGroup, usage: originalUsage }
}

type HistorySource = NonNullable<ReturnType<typeof groupSource>>
type HistoryOrigin = PlanOutputHistoryGroup['origin']

function optionalOriginLabels(origin: Record<string, unknown>): boolean {
  return !(
    (Object.hasOwn(origin, 'servingProvider') &&
      (typeof origin.servingProvider !== 'string' || !origin.servingProvider)) ||
    (Object.hasOwn(origin, 'upstreamModel') &&
      (typeof origin.upstreamModel !== 'string' || !origin.upstreamModel))
  )
}

function validOriginBinding(origin: Record<string, unknown>): boolean {
  return !(
    Object.keys(origin).some(
      key =>
        !['adaptation', 'provider', 'servingProvider', 'upstreamModel', 'parameters'].includes(key),
    ) ||
    !Object.hasOwn(origin, 'adaptation') ||
    !Object.hasOwn(origin, 'provider') ||
    !Object.hasOwn(origin, 'parameters') ||
    !validateProfile('ModelAdaptationBinding', origin.adaptation).valid ||
    !validateProfile('ProviderName', origin.provider).valid ||
    !('ok' in judgeModelProfileDocument('ModelRequestParameters', origin.parameters))
  )
}

function copyHistoryOrigin(origin: Record<string, unknown>): HistoryOrigin | undefined {
  if (!validOriginBinding(origin) || !optionalOriginLabels(origin)) return undefined
  const adaptation = origin.adaptation as unknown as ModelAdaptationBinding
  const parameters = origin.parameters as unknown as ModelRequestParameters
  return {
    adaptation,
    provider: origin.provider as string,
    ...(origin.servingProvider === undefined
      ? {}
      : { servingProvider: origin.servingProvider as string }),
    ...(origin.upstreamModel === undefined
      ? {}
      : { upstreamModel: origin.upstreamModel as string }),
    parameters,
  }
}

function requestOriginMatches(source: HistorySource, origin: HistoryOrigin): boolean {
  const request = source.calibration.requestInput
  if (request.kind !== 'known') return true
  const basis = request.countingBasis
  return (
    modelLogJsonEqual(basis.binding, origin.adaptation) &&
    basis.model === origin.adaptation.definition.modelId &&
    basis.provider === origin.provider &&
    request.projectionRevision === source.outputGroup.projectionRevision
  )
}

function observedOriginMatches(
  observed: InputCalibration['observedInput'],
  origin: HistoryOrigin,
): boolean {
  return !(
    observed.kind !== 'unavailable' &&
    ((observed.provenance.upstreamModel !== undefined &&
      origin.upstreamModel !== undefined &&
      observed.provenance.upstreamModel !== origin.upstreamModel) ||
      (observed.provenance.servingProvider !== undefined &&
        origin.servingProvider !== undefined &&
        observed.provenance.servingProvider !== origin.servingProvider))
  )
}

function copyHistoryGroup(
  raw: unknown,
  messages: readonly Message[],
): PlanOutputHistoryGroup | undefined {
  const group = captureHistoryGroup(raw)
  if (group === undefined) return undefined
  const source = groupSource(group)
  if (source === undefined) return undefined
  const blocks = copyPlanContentBlocks(group.outputBlocks)
  if (blocks === undefined) return undefined
  if (
    source.outputGroup.source === 'none' ||
    source.outputGroup.blockDigests.length !== blocks.length
  )
    return undefined
  const selected = copySelection(group.replaySelection, blocks, messages)
  if (selected === undefined) return undefined
  const origin = copyHistoryOrigin(group.origin)
  if (origin === undefined) return undefined
  if (!requestOriginMatches(source, origin)) return undefined
  if (!observedOriginMatches(source.calibration.observedInput, origin)) return undefined
  return {
    inputCalibration: source.calibration,
    usage: source.usage,
    outputBlocks: Object.freeze(blocks),
    replaySelection: selected,
    origin: Object.freeze(origin),
  }
}

interface HistoryTargets {
  readonly all: Set<string>
  previousMessage: number
  previousBlock: number
}

function recordHistoryTargets(
  selected: readonly ReplaySelection[],
  state: HistoryTargets,
): boolean {
  for (const item of selected) {
    const key = `${item.messageIndex}:${item.blockIndex}`
    if (state.all.has(key)) return false
    state.all.add(key)
  }
  const first = selected[0]!
  if (
    !laterTarget(first.messageIndex, first.blockIndex, state.previousMessage, state.previousBlock)
  )
    return false
  state.previousMessage = first.messageIndex
  state.previousBlock = first.blockIndex
  return true
}

function currentCalibrationMatches(
  groups: readonly PlanOutputHistoryGroup[],
  calibration: PlanCalibration,
): boolean {
  if (calibration.kind !== 'observation') return true
  const overlapping = groups.filter(group =>
    group.replaySelection.some(item =>
      calibration.replaySelection.some(
        anchor =>
          anchor.messageIndex === item.messageIndex && anchor.blockIndex === item.blockIndex,
      ),
    ),
  )
  return !(
    overlapping.length > 1 ||
    (overlapping.length === 1 &&
      !modelLogJsonEqual(
        {
          kind: 'observation',
          inputCalibration: overlapping[0]!.inputCalibration,
          usage: overlapping[0]!.usage,
          outputBlocks: overlapping[0]!.outputBlocks,
          replaySelection: overlapping[0]!.replaySelection,
        },
        calibration,
      ))
  )
}

/** Own explicit source facts; shape and target relationships do not authenticate their provenance. */
export function copyPlanOutputHistory(
  value: unknown,
  messages: readonly Message[],
  calibration: PlanCalibration,
): readonly PlanOutputHistoryGroup[] | undefined {
  if (!Array.isArray(value)) return undefined
  const ownedMessages = copyPlanMessages(messages)
  if (ownedMessages === undefined) return undefined
  const groups: PlanOutputHistoryGroup[] = []
  const targets: HistoryTargets = { all: new Set(), previousMessage: -1, previousBlock: -1 }
  for (const raw of value) {
    const group = copyHistoryGroup(raw, ownedMessages)
    if (group === undefined) return undefined
    if (!recordHistoryTargets(group.replaySelection, targets)) return undefined
    groups.push(Object.freeze(group))
  }
  if (!currentCalibrationMatches(groups, calibration)) return undefined
  return Object.freeze(groups)
}
