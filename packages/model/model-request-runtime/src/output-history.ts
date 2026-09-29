import { ExactDecimal, judgeAccountValue, type Usage } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  judgeContentBlock,
  type ContentBlock,
} from '@omne-harness-lite/content-blocks'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import {
  judgeModelProfileDocument,
  validate as validateProfile,
  type ModelAdaptationBinding,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import { copyInputCalibration } from '@omne-harness-lite/model-response'
import { modelLogJsonEqual } from './log-codec.ts'
import type { PlanCalibration, PlanOutputHistoryGroup, ReplaySelection } from './types.ts'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function index(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
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
    if (
      !record(raw) ||
      Object.keys(raw).length !== 3 ||
      !index(raw.sourceBlockIndex) ||
      !index(raw.messageIndex) ||
      !index(raw.blockIndex)
    )
      return undefined
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
      messageIndex < previousMessage ||
      (messageIndex === previousMessage && blockIndex <= previousBlock)
    )
      return undefined
    selected.push(Object.freeze({ sourceBlockIndex, messageIndex, blockIndex }))
    targets.add(key)
    previousMessage = messageIndex
    previousBlock = blockIndex
  }
  return Object.freeze(selected)
}

/** Own explicit source facts; shape and target relationships do not authenticate their provenance. */
export function copyPlanOutputHistory(
  value: unknown,
  messages: readonly Message[],
  calibration: PlanCalibration,
): readonly PlanOutputHistoryGroup[] | undefined {
  if (!Array.isArray(value)) return undefined
  const ownedMessages: Message[] = []
  for (const message of messages) {
    const judged = judgeMessage(message)
    if ('rejected' in judged) return undefined
    ownedMessages.push(judged.ok)
  }
  const groups: PlanOutputHistoryGroup[] = []
  const allTargets = new Set<string>()
  let previousMessage = -1
  let previousBlock = -1
  for (const raw of value) {
    const copied = copyJsonValue(raw)
    if (!('ok' in copied) || !record(copied.ok)) return undefined
    const group = copied.ok
    if (
      Object.keys(group).length !== 5 ||
      !Object.hasOwn(group, 'inputCalibration') ||
      !Object.hasOwn(group, 'usage') ||
      !Object.hasOwn(group, 'outputBlocks') ||
      !Object.hasOwn(group, 'replaySelection') ||
      !Object.hasOwn(group, 'origin') ||
      !Array.isArray(group.outputBlocks) ||
      !record(group.origin)
    )
      return undefined
    const source = copyInputCalibration(group.inputCalibration)
    if (!('ok' in source) || source.ok.outputGroup.kind !== 'known') return undefined
    const usage = judgeAccountValue('Usage', group.usage)
    if (!('ok' in usage)) return undefined
    const originalUsage = group.usage as unknown as Usage
    const observedInput = source.ok.observedInput
    const inputParts = [
      originalUsage.input_tokens,
      originalUsage.cache_read_tokens,
      originalUsage.cache_write_tokens,
    ]
    if (
      (observedInput.kind === 'from_usage' &&
        (originalUsage.source !== 'upstream' || inputParts.some(part => part === 'unknown'))) ||
      (observedInput.kind === 'upstream_total' &&
        (inputParts.every(part => part !== 'unknown') ||
          inputParts
            .reduce(
              (sum, part) => (part === 'unknown' ? sum : sum.add(ExactDecimal.from(part))),
              ExactDecimal.from(0),
            )
            .compare(ExactDecimal.from(observedInput.tokens)) > 0))
    )
      return undefined
    const blocks: ContentBlock[] = []
    for (const rawBlock of group.outputBlocks) {
      const judged = judgeContentBlock(rawBlock)
      if (!('ok' in judged)) return undefined
      blocks.push(judged.ok)
    }
    if (
      source.ok.outputGroup.source === 'none' ||
      source.ok.outputGroup.blockDigests.length !== blocks.length
    )
      return undefined
    const selected = copySelection(group.replaySelection, blocks, ownedMessages)
    if (selected === undefined) return undefined
    const origin = group.origin
    if (
      Object.keys(origin).some(
        key =>
          !['adaptation', 'provider', 'servingProvider', 'upstreamModel', 'parameters'].includes(
            key,
          ),
      ) ||
      !Object.hasOwn(origin, 'adaptation') ||
      !Object.hasOwn(origin, 'provider') ||
      !Object.hasOwn(origin, 'parameters') ||
      !validateProfile('ModelAdaptationBinding', origin.adaptation).valid ||
      !validateProfile('ProviderName', origin.provider).valid ||
      !('ok' in judgeModelProfileDocument('ModelRequestParameters', origin.parameters)) ||
      (Object.hasOwn(origin, 'servingProvider') &&
        (typeof origin.servingProvider !== 'string' || !origin.servingProvider)) ||
      (Object.hasOwn(origin, 'upstreamModel') &&
        (typeof origin.upstreamModel !== 'string' || !origin.upstreamModel))
    )
      return undefined
    const adaptation = origin.adaptation as unknown as ModelAdaptationBinding
    const parameters = origin.parameters as unknown as ModelRequestParameters
    if (source.ok.requestInput.kind === 'known') {
      const basis = source.ok.requestInput.countingBasis
      if (
        !modelLogJsonEqual(basis.binding, adaptation) ||
        basis.model !== adaptation.definition.modelId ||
        basis.provider !== origin.provider
      )
        return undefined
    }
    if (
      source.ok.requestInput.kind === 'known' &&
      source.ok.requestInput.projectionRevision !== source.ok.outputGroup.projectionRevision
    )
      return undefined
    const observed = source.ok.observedInput
    if (
      observed.kind !== 'unavailable' &&
      ((observed.provenance.upstreamModel !== undefined &&
        origin.upstreamModel !== undefined &&
        observed.provenance.upstreamModel !== origin.upstreamModel) ||
        (observed.provenance.servingProvider !== undefined &&
          origin.servingProvider !== undefined &&
          observed.provenance.servingProvider !== origin.servingProvider))
    )
      return undefined
    for (const item of selected) {
      const key = `${item.messageIndex}:${item.blockIndex}`
      if (allTargets.has(key)) return undefined
      allTargets.add(key)
    }
    const first = selected[0]!
    if (
      first.messageIndex < previousMessage ||
      (first.messageIndex === previousMessage && first.blockIndex <= previousBlock)
    )
      return undefined
    previousMessage = first.messageIndex
    previousBlock = first.blockIndex
    groups.push(
      Object.freeze({
        inputCalibration: source.ok,
        usage: originalUsage,
        outputBlocks: Object.freeze(blocks),
        replaySelection: selected,
        origin: Object.freeze({
          adaptation,
          provider: origin.provider as string,
          ...(origin.servingProvider === undefined
            ? {}
            : { servingProvider: origin.servingProvider as string }),
          ...(origin.upstreamModel === undefined
            ? {}
            : { upstreamModel: origin.upstreamModel as string }),
          parameters,
        }),
      }),
    )
  }
  if (calibration.kind === 'observation') {
    const overlapping = groups.filter(group =>
      group.replaySelection.some(item =>
        calibration.replaySelection.some(
          anchor =>
            anchor.messageIndex === item.messageIndex && anchor.blockIndex === item.blockIndex,
        ),
      ),
    )
    if (
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
      return undefined
  }
  return Object.freeze(groups)
}
