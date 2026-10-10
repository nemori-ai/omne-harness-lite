import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { Message } from '@omne-harness-lite/messages'
import { judgeModelResponse } from '@omne-harness-lite/model-response'
import type { LogEntry } from '@omne-harness-lite/session-log'
import {
  interpretCallHistory,
  rejectAcknowledgedHistory,
} from '@omne-harness-lite/model-request-runtime'
import { inspectSettlementPrefixEntries } from '@omne-harness-lite/model-request-runtime'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import {
  interpretSettlementPrefix,
  settlementGenerationCurrent,
} from '@omne-harness-lite/model-request-runtime'
import type { SettlementPrefix } from '@omne-harness-lite/model-request-runtime'
import type { CurrentHistoryReaders } from '@omne-harness-lite/model-request-runtime'
import { copyPlanOutputHistory } from '@omne-harness-lite/model-request-runtime'
import type {
  PlanCalibration,
  PlanOutputHistoryGroup,
} from '@omne-harness-lite/model-request-runtime'

import type { ContentBlock } from '@omne-harness-lite/content-blocks'
import type { InputCalibration } from '@omne-harness-lite/model-response'
import type {
  InspectedModelLogEntry,
  LocatedCalibrationCandidate,
  CalibrationSelectedSource,
  CalibrationHistoryResult,
  SettlementComplete,
  ReplaySelection,
} from '@omne-harness-lite/model-request-runtime'
export type AuthorizedCalibrationResult =
  | {
      readonly calibration: PlanCalibration
      readonly outputHistory: readonly PlanOutputHistoryGroup[]
    }
  | { readonly unavailable: true }

function sameEntry(left: unknown, right: unknown): boolean {
  return modelLogJsonEqual(left, right)
}

type CalibrationTarget = Parameters<CurrentHistoryReaders['calibration']>[2]
type CalibrationCandidates = Extract<CalibrationHistoryResult, { readonly candidates: unknown }>
type CalibrationEntryLocator = (entry: LogEntry) => InspectedModelLogEntry | undefined

/**
 * Recheck source locators against one authorized full prefix. Adjacent M/R values are
 * not a physical append certificate; the original settlement writer and SL3 own that.
 */
export function authorizedCalibration(
  prefix: SettlementPrefix,
  messages: readonly Message[],
  target: Parameters<CurrentHistoryReaders['calibration']>[2],
  read: CurrentHistoryReaders['calibration'],
): AuthorizedCalibrationResult {
  if (
    !settlementGenerationCurrent(prefix.binding) ||
    (target.run === undefined) !== (target.attempt === undefined)
  )
    return { unavailable: true }
  let interpreted: ReturnType<CurrentHistoryReaders['calibration']>
  try {
    interpreted = read(prefix, messages, target)
  } catch {
    return { unavailable: true }
  }
  if ('sourceUnavailable' in interpreted) return unavailableSources(prefix, messages, target)
  if ('noObservation' in interpreted)
    return messages.some(message => message.type === 'assistant')
      ? { unavailable: true }
      : { calibration: { kind: 'none', reason: 'no_observation' }, outputHistory: [] }
  if (!Array.isArray(interpreted.candidates) || !Array.isArray(interpreted.selectedSources))
    return { unavailable: true }
  return calibrationFromCandidates(prefix, messages, target, interpreted)
}

function unavailableSources(
  prefix: SettlementPrefix,
  messages: readonly Message[],
  target: CalibrationTarget,
): AuthorizedCalibrationResult {
  const inspected = inspectSettlementPrefixEntries({ prefix })
  if (
    !('ok' in inspected) ||
    'unavailable' in
      rejectAcknowledgedHistory(interpretCallHistory({ prefix, callId: target.callId }))
  )
    return { unavailable: true }
  // A reader failure cannot demote a selected reply with a broken original
  // D/M/R batch into a source-less full count. Check those durable members
  // from the same authorized prefix before returning the explicit empty set.
  const { attachedById, responseById } = unavailableSourceIndex(inspected.ok)
  for (const message of messages) {
    if (message.type !== 'assistant') continue
    if (!selectedBatchComplete(prefix, message, attachedById, responseById))
      return { unavailable: true }
  }
  return { calibration: { kind: 'none', reason: 'source_unavailable' }, outputHistory: [] }
}

function unavailableSourceIndex(entries: readonly InspectedModelLogEntry[]): {
  readonly attachedById: ReadonlyMap<string, InspectedModelLogEntry | null>
  readonly responseById: ReadonlyMap<string, InspectedModelLogEntry | null>
} {
  const attachedById = new Map<string, InspectedModelLogEntry | null>()
  const responseById = new Map<string, InspectedModelLogEntry | null>()
  for (const item of entries) {
    const capturedMessage = item.captured.message
    if (capturedMessage?.type === 'assistant') {
      const id = capturedMessage.id
      attachedById.set(id, attachedById.has(id) ? null : item)
    }
    const capturedResponse = item.captured.response
    if (capturedResponse !== null) {
      const id = capturedResponse.id
      responseById.set(id, responseById.has(id) ? null : item)
    }
  }
  return { attachedById, responseById }
}

function selectedBatchComplete(
  prefix: SettlementPrefix,
  message: Extract<Message, { readonly type: 'assistant' }>,
  attachedById: ReadonlyMap<string, InspectedModelLogEntry | null>,
  responseById: ReadonlyMap<string, InspectedModelLogEntry | null>,
): boolean {
  const attached = attachedById.get(message.id)
  const response = responseById.get(message.response)
  const original = response?.captured.response
  if (!attached || !sameEntry(attached.captured.message, message) || !response || !original)
    return false
  const batch = interpretSettlementPrefix({
    prefix,
    target: {
      call: original.call.callId,
      dispatch: original.dispatch,
      response: original.id,
    },
    current: null,
  })
  if (
    !('facts' in batch) ||
    !('completeMembers' in batch.facts.members) ||
    !batch.facts.members.completeMembers.entries.some(entry => sameEntry(entry, attached.entry)) ||
    !batch.facts.members.completeMembers.entries.some(entry => sameEntry(entry, response.entry))
  )
    return false
  return true
}

function calibrationFromCandidates(
  prefix: SettlementPrefix,
  messages: readonly Message[],
  target: CalibrationTarget,
  interpreted: CalibrationCandidates,
): AuthorizedCalibrationResult {
  const inspected = inspectSettlementPrefixEntries({ prefix })
  if (!('ok' in inspected)) return { unavailable: true }
  const located = (entry: LogEntry) => {
    const position = ExactDecimal.from(entry.position)
    const found = inspected.ok.find(
      item => ExactDecimal.from(item.entry.position).compare(position) === 0,
    )
    return found !== undefined && sameEntry(found.entry, entry) ? found : undefined
  }
  const sourceEntries = selectedSourceEntries(interpreted.selectedSources, messages, located)
  if (sourceEntries === undefined) return { unavailable: true }
  const sources = sourceEntries
  if (sources.size !== messages.length) return { unavailable: true }
  let priorIndex = messages.length
  let priorDispatch = ExactDecimal.from(target.dispatch)
  let selectedSeen = false
  let selectedObservation: PlanCalibration | undefined
  const history: PlanOutputHistoryGroup[] = []
  const originalResponses = new Set<string>()
  for (const candidate of interpreted.candidates) {
    if (!adoptCandidate(candidate)) return { unavailable: true }
  }
  const ownedCalibration = selectedObservation ?? {
    kind: 'none' as const,
    reason: 'no_observation' as const,
  }
  const ownedHistory = copyPlanOutputHistory(history.reverse(), messages, ownedCalibration)
  if (ownedHistory === undefined) return { unavailable: true }
  return { calibration: ownedCalibration, outputHistory: ownedHistory }

  function adoptCandidate(candidate: LocatedCalibrationCandidate): boolean {
    const anchors = candidateAnchors(candidate, located)
    if (anchors === undefined) return false
    const { response, dispatched } = anchors
    if (originalResponses.has(candidate.response.id)) return false
    originalResponses.add(candidate.response.id)
    const branch = candidateBranch(candidate, dispatched)
    if (branch === undefined) return false
    const originalMembers = candidateMembers(prefix, candidate, response)
    if (originalMembers === undefined) return false
    if (!originAllowed(candidate, dispatched, response, originalMembers, branch.run)) return false
    return collectObservation(candidate)
  }

  function originAllowed(
    candidate: LocatedCalibrationCandidate,
    dispatched: InspectedModelLogEntry,
    response: InspectedModelLogEntry,
    originalMembers: SettlementComplete,
    originalRun: LogEntry['run'],
  ): boolean {
    if (candidate.origin === 'selected_reply') {
      const index = candidate.messageIndex
      if (!Number.isSafeInteger(index) || index < 0 || index >= priorIndex) return false
      if (!selectedCandidateMatches(candidate, index, messages, sources, located, originalMembers))
        return false
      selectedSeen = true
      priorIndex = index
    } else if (candidate.origin === 'same_call_retry') {
      const ordinal = eligibleRetry(
        candidate,
        target,
        originalMembers,
        originalRun,
        selectedSeen,
        priorDispatch,
      )
      if (ordinal === undefined) return false
      if (!actualRetryHistory(prefix, target, ordinal, dispatched, response)) return false
      priorDispatch = ordinal
    } else return false
    return true
  }

  function collectObservation(candidate: LocatedCalibrationCandidate): boolean {
    if (!replaySelectionValid(candidate)) return false
    const observation = candidate.response.inputCalibration.observedInput
    const request = candidate.response.inputCalibration.requestInput
    const group = candidate.response.inputCalibration.outputGroup
    const outputBlocks = calibrationOutputBlocks(candidate, group)
    if (outputBlocks === undefined) return false
    if (!replayMappingValid(candidate, messages, outputBlocks)) return false
    if (candidate.replaySelection.length && group.kind === 'known')
      history.push(calibrationHistoryContribution(candidate, outputBlocks))
    if (
      request.kind === 'known' &&
      (observation.kind === 'from_usage' || observation.kind === 'upstream_total')
    )
      selectedObservation ??= {
        kind: 'observation',
        inputCalibration: candidate.response.inputCalibration,
        usage: candidate.response.usage,
        outputBlocks,
        replaySelection: candidate.replaySelection,
      }
    return true
  }
}

function selectedSourceEntries(
  selectedSources: readonly CalibrationSelectedSource[],
  messages: readonly Message[],
  located: CalibrationEntryLocator,
): Map<number, LogEntry | null> | undefined {
  const sources = new Map<number, LogEntry | null>()
  for (const source of selectedSources) {
    if (
      !Number.isSafeInteger(source.messageIndex) ||
      source.messageIndex < 0 ||
      source.messageIndex >= messages.length ||
      sources.has(source.messageIndex)
    )
      return undefined
    if (source.entry !== null) {
      const found = located(source.entry)
      if (
        found?.captured.message === null ||
        !modelLogJsonEqual(found?.captured.message, messages[source.messageIndex])
      )
        return undefined
    }
    sources.set(source.messageIndex, source.entry)
  }
  return sources
}

function candidateAnchors(
  candidate: LocatedCalibrationCandidate,
  located: CalibrationEntryLocator,
):
  | { readonly response: InspectedModelLogEntry; readonly dispatched: InspectedModelLogEntry }
  | undefined {
  if (!('ok' in judgeModelResponse(candidate.response))) return undefined
  const response = located(candidate.responseEntry)
  const dispatched = located(candidate.dispatchedEntry)
  if (
    response?.captured.response === null ||
    response === undefined ||
    dispatched?.captured.record?.kind !== 'model_call_dispatched' ||
    !modelLogJsonEqual(response.captured.value, candidate.response) ||
    dispatched.captured.record.response !== candidate.response.id ||
    dispatched.captured.record.call !== candidate.response.call.callId ||
    ExactDecimal.from(dispatched.captured.record.dispatch).compare(
      ExactDecimal.from(candidate.response.dispatch),
    ) !== 0
  )
    return undefined
  return { response, dispatched }
}

function candidateBranch(
  candidate: LocatedCalibrationCandidate,
  dispatched: InspectedModelLogEntry,
): { readonly run: LogEntry['run'] } | undefined {
  const originalRun = dispatched.entry.run
  const originalAttempt = dispatched.entry.attempt
  if (
    (originalRun === undefined) !== (originalAttempt === undefined) ||
    candidate.response.call.runId !== originalRun ||
    (originalAttempt === undefined) !== (candidate.response.attemptId === undefined) ||
    (originalAttempt !== undefined &&
      candidate.response.attemptId !== undefined &&
      ExactDecimal.from(originalAttempt).compare(
        ExactDecimal.from(candidate.response.attemptId),
      ) !== 0)
  )
    return undefined
  return { run: originalRun }
}

function candidateMembers(
  prefix: SettlementPrefix,
  candidate: LocatedCalibrationCandidate,
  response: InspectedModelLogEntry,
): SettlementComplete | undefined {
  const members = interpretSettlementPrefix({
    prefix,
    target: {
      call: candidate.response.call.callId,
      dispatch: candidate.response.dispatch,
      response: candidate.response.id,
    },
    current: null,
  })
  if (!('facts' in members) || !('completeMembers' in members.facts.members)) return undefined
  const originalMembers = members.facts.members.completeMembers
  if (!originalMembers.entries.some(entry => sameEntry(entry, response.entry))) return undefined
  return originalMembers
}

function selectedCandidateMatches(
  candidate: Extract<LocatedCalibrationCandidate, { readonly origin: 'selected_reply' }>,
  index: number,
  messages: readonly Message[],
  sources: ReadonlyMap<number, LogEntry | null>,
  located: CalibrationEntryLocator,
  originalMembers: SettlementComplete,
): boolean {
  const message = messages[index]
  const selected = sources.get(index)
  const attached = located(candidate.messageEntry)
  if (
    message?.type !== 'assistant' ||
    selected === null ||
    selected === undefined ||
    !sameEntry(selected, candidate.messageEntry) ||
    attached?.captured.message?.type !== 'assistant' ||
    !modelLogJsonEqual(attached.captured.message, message) ||
    message.response !== candidate.response.id ||
    !originalMembers.entries.some(entry => sameEntry(entry, attached.entry))
  )
    return false
  return true
}

function eligibleRetry(
  candidate: LocatedCalibrationCandidate,
  target: CalibrationTarget,
  originalMembers: SettlementComplete,
  originalRun: LogEntry['run'],
  selectedSeen: boolean,
  priorDispatch: ExactDecimal,
): ExactDecimal | undefined {
  const ordinal = ExactDecimal.from(candidate.response.dispatch)
  if (
    selectedSeen ||
    candidate.response.call.callId !== target.callId ||
    originalRun !== target.run ||
    candidate.response.reply !== undefined ||
    ordinal.compare(priorDispatch) >= 0 ||
    originalMembers.message !== null
  )
    return undefined
  return ordinal
}

function actualRetryHistory(
  prefix: SettlementPrefix,
  target: CalibrationTarget,
  ordinal: ExactDecimal,
  dispatched: InspectedModelLogEntry,
  response: InspectedModelLogEntry,
): boolean {
  const history = rejectAcknowledgedHistory(interpretCallHistory({ prefix, callId: target.callId }))
  const latest = 'known' in history ? history.known.dispatches.at(-1) : undefined
  if (
    !('known' in history) ||
    latest === undefined ||
    ExactDecimal.from(latest.ordinal)
      .add(ExactDecimal.from(1))
      .compare(ExactDecimal.from(target.dispatch)) !== 0 ||
    !history.known.dispatches.some(
      item =>
        ExactDecimal.from(item.ordinal).compare(ordinal) === 0 &&
        sameEntry(item.dispatched, dispatched.entry) &&
        item.response !== null &&
        sameEntry(item.response.entry, response.entry),
    )
  )
    return false
  return true
}

function replaySelectionValid(candidate: LocatedCalibrationCandidate): boolean {
  if (!Array.isArray(candidate.replaySelection)) return false
  for (const selection of candidate.replaySelection) {
    if (
      !Number.isSafeInteger(selection.sourceBlockIndex) ||
      selection.sourceBlockIndex < 0 ||
      !Number.isSafeInteger(selection.messageIndex) ||
      selection.messageIndex < 0 ||
      !Number.isSafeInteger(selection.blockIndex) ||
      selection.blockIndex < 0
    )
      return false
  }
  return true
}

function calibrationOutputBlocks(
  candidate: LocatedCalibrationCandidate,
  group: InputCalibration['outputGroup'],
): readonly ContentBlock[] | undefined {
  const outputBlocks =
    group.kind === 'known' && group.source === 'reply'
      ? candidate.response.reply?.blocks
      : group.kind === 'known' && group.source === 'delivered'
        ? candidate.response.delivered
        : []
  return outputBlocks
}

function replayMappingValid(
  candidate: LocatedCalibrationCandidate,
  messages: readonly Message[],
  outputBlocks: readonly ContentBlock[],
): boolean {
  const mapped = new Set<string>()
  for (const selection of candidate.replaySelection) {
    const message = messages[selection.messageIndex]
    const key = `${selection.messageIndex}:${selection.blockIndex}`
    if (
      !replaySourceIndexValid(selection, outputBlocks) ||
      !Number.isSafeInteger(selection.messageIndex) ||
      selection.messageIndex < 0 ||
      !Number.isSafeInteger(selection.blockIndex) ||
      selection.blockIndex < 0 ||
      selection.blockIndex >= (message?.blocks.length ?? 0) ||
      mapped.has(key)
    )
      return false
    mapped.add(key)
  }
  return true
}

function replaySourceIndexValid(
  selection: ReplaySelection,
  outputBlocks: readonly ContentBlock[],
): boolean {
  if (
    !Number.isSafeInteger(selection.sourceBlockIndex) ||
    selection.sourceBlockIndex < 0 ||
    selection.sourceBlockIndex >= outputBlocks.length
  )
    return false
  return true
}

function calibrationHistoryContribution(
  candidate: LocatedCalibrationCandidate,
  outputBlocks: readonly ContentBlock[],
): PlanOutputHistoryGroup {
  const route = candidate.response.route
  return {
    inputCalibration: candidate.response.inputCalibration,
    usage: candidate.response.usage,
    outputBlocks,
    replaySelection: candidate.replaySelection,
    origin: {
      adaptation: route.adaptation,
      provider: route.provider,
      ...(route.servingProvider === undefined ? {} : { servingProvider: route.servingProvider }),
      ...(route.upstreamModel === undefined ? {} : { upstreamModel: route.upstreamModel }),
      parameters: route.parameters,
    },
  }
}
