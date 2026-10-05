import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { Message } from '@omne-harness-lite/messages'
import { judgeModelResponse } from '@omne-harness-lite/model-response'
import type { LogEntry } from '@omne-harness-lite/session-log'
import { interpretCallHistory, rejectAcknowledgedHistory } from './call-history.ts'
import { inspectCurrentModelLogPrefix } from '@omne-harness-lite/model-request-runtime'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import { interpretSettlementPrefix, settlementGenerationCurrent } from './settlement-prefix.ts'
import type { SettlementPrefix } from './settlement-prefix.ts'
import type { CurrentHistoryReaders } from './service-types.ts'
import { copyPlanOutputHistory } from '@omne-harness-lite/model-request-runtime'
import type {
  PlanCalibration,
  PlanOutputHistoryGroup,
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
  if ('sourceUnavailable' in interpreted) {
    const inspected = inspectCurrentModelLogPrefix({
      session: prefix.binding.session,
      tenant: prefix.binding.tenant,
      prefix,
    })
    if (
      !('ok' in inspected) ||
      'unavailable' in
        rejectAcknowledgedHistory(interpretCallHistory({ prefix, callId: target.callId }))
    )
      return { unavailable: true }
    // A reader failure cannot demote a selected reply with a broken original
    // D/M/R batch into a source-less full count. Check those durable members
    // from the same authorized prefix before returning the explicit empty set.
    type Located = (typeof inspected.ok)[number]
    const attachedById = new Map<string, Located | null>()
    const responseById = new Map<string, Located | null>()
    for (const item of inspected.ok) {
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
    for (const message of messages) {
      if (message.type !== 'assistant') continue
      const attached = attachedById.get(message.id)
      const response = responseById.get(message.response)
      const original = response?.captured.response
      if (!attached || !sameEntry(attached.captured.message, message) || !response || !original)
        return { unavailable: true }
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
        !batch.facts.members.completeMembers.entries.some(entry =>
          sameEntry(entry, attached.entry),
        ) ||
        !batch.facts.members.completeMembers.entries.some(entry => sameEntry(entry, response.entry))
      )
        return { unavailable: true }
    }
    return { calibration: { kind: 'none', reason: 'source_unavailable' }, outputHistory: [] }
  }
  if ('noObservation' in interpreted)
    return messages.some(message => message.type === 'assistant')
      ? { unavailable: true }
      : { calibration: { kind: 'none', reason: 'no_observation' }, outputHistory: [] }
  if (!Array.isArray(interpreted.candidates) || !Array.isArray(interpreted.selectedSources))
    return { unavailable: true }
  const inspected = inspectCurrentModelLogPrefix({
    session: prefix.binding.session,
    tenant: prefix.binding.tenant,
    prefix,
  })
  if (!('ok' in inspected)) return { unavailable: true }
  const located = (entry: LogEntry) => {
    const position = ExactDecimal.from(entry.position)
    const found = inspected.ok.find(
      item => ExactDecimal.from(item.entry.position).compare(position) === 0,
    )
    return found !== undefined && sameEntry(found.entry, entry) ? found : undefined
  }
  const sources = new Map<number, LogEntry | null>()
  for (const source of interpreted.selectedSources) {
    if (
      !Number.isSafeInteger(source.messageIndex) ||
      source.messageIndex < 0 ||
      source.messageIndex >= messages.length ||
      sources.has(source.messageIndex)
    )
      return { unavailable: true }
    if (source.entry !== null) {
      const found = located(source.entry)
      if (
        found?.captured.message === null ||
        !modelLogJsonEqual(found?.captured.message, messages[source.messageIndex])
      )
        return { unavailable: true }
    }
    sources.set(source.messageIndex, source.entry)
  }
  if (sources.size !== messages.length) return { unavailable: true }
  let priorIndex = messages.length
  let priorDispatch = ExactDecimal.from(target.dispatch)
  let selectedSeen = false
  let selectedObservation: PlanCalibration | undefined
  const history: PlanOutputHistoryGroup[] = []
  const originalResponses = new Set<string>()
  for (const candidate of interpreted.candidates) {
    if (!('ok' in judgeModelResponse(candidate.response))) return { unavailable: true }
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
      return { unavailable: true }
    if (originalResponses.has(candidate.response.id)) return { unavailable: true }
    originalResponses.add(candidate.response.id)
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
      return { unavailable: true }
    const members = interpretSettlementPrefix({
      prefix,
      target: {
        call: candidate.response.call.callId,
        dispatch: candidate.response.dispatch,
        response: candidate.response.id,
      },
      current: null,
    })
    if (!('facts' in members) || !('completeMembers' in members.facts.members))
      return { unavailable: true }
    const originalMembers = members.facts.members.completeMembers
    if (!originalMembers.entries.some(entry => sameEntry(entry, response.entry)))
      return { unavailable: true }
    if (candidate.origin === 'selected_reply') {
      const index = candidate.messageIndex
      if (!Number.isSafeInteger(index) || index < 0 || index >= priorIndex)
        return { unavailable: true }
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
        return { unavailable: true }
      selectedSeen = true
      priorIndex = index
    } else if (candidate.origin === 'same_call_retry') {
      const ordinal = ExactDecimal.from(candidate.response.dispatch)
      if (
        selectedSeen ||
        candidate.response.call.callId !== target.callId ||
        originalRun !== target.run ||
        candidate.response.reply !== undefined ||
        ordinal.compare(priorDispatch) >= 0 ||
        originalMembers.message !== null
      )
        return { unavailable: true }
      const history = rejectAcknowledgedHistory(
        interpretCallHistory({ prefix, callId: target.callId }),
      )
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
        return { unavailable: true }
      priorDispatch = ordinal
    } else return { unavailable: true }
    if (!Array.isArray(candidate.replaySelection)) return { unavailable: true }
    for (const selection of candidate.replaySelection) {
      if (
        !Number.isSafeInteger(selection.sourceBlockIndex) ||
        selection.sourceBlockIndex < 0 ||
        !Number.isSafeInteger(selection.messageIndex) ||
        selection.messageIndex < 0 ||
        !Number.isSafeInteger(selection.blockIndex) ||
        selection.blockIndex < 0
      )
        return { unavailable: true }
    }
    const observation = candidate.response.inputCalibration.observedInput
    const request = candidate.response.inputCalibration.requestInput
    const group = candidate.response.inputCalibration.outputGroup
    const outputBlocks =
      group.kind === 'known' && group.source === 'reply'
        ? candidate.response.reply?.blocks
        : group.kind === 'known' && group.source === 'delivered'
          ? candidate.response.delivered
          : []
    if (outputBlocks === undefined) return { unavailable: true }
    const mapped = new Set<string>()
    for (const selection of candidate.replaySelection) {
      const message = messages[selection.messageIndex]
      const key = `${selection.messageIndex}:${selection.blockIndex}`
      if (
        !Number.isSafeInteger(selection.sourceBlockIndex) ||
        selection.sourceBlockIndex < 0 ||
        selection.sourceBlockIndex >= outputBlocks.length ||
        !Number.isSafeInteger(selection.messageIndex) ||
        selection.messageIndex < 0 ||
        !Number.isSafeInteger(selection.blockIndex) ||
        selection.blockIndex < 0 ||
        selection.blockIndex >= (message?.blocks.length ?? 0) ||
        mapped.has(key)
      )
        return { unavailable: true }
      mapped.add(key)
    }
    if (candidate.replaySelection.length && group.kind === 'known') {
      const route = candidate.response.route
      history.push({
        inputCalibration: candidate.response.inputCalibration,
        usage: candidate.response.usage,
        outputBlocks,
        replaySelection: candidate.replaySelection,
        origin: {
          adaptation: route.adaptation,
          provider: route.provider,
          ...(route.servingProvider === undefined
            ? {}
            : { servingProvider: route.servingProvider }),
          ...(route.upstreamModel === undefined ? {} : { upstreamModel: route.upstreamModel }),
          parameters: route.parameters,
        },
      })
    }
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
  }
  const ownedCalibration = selectedObservation ?? {
    kind: 'none' as const,
    reason: 'no_observation' as const,
  }
  const ownedHistory = copyPlanOutputHistory(history.reverse(), messages, ownedCalibration)
  if (ownedHistory === undefined) return { unavailable: true }
  return { calibration: ownedCalibration, outputHistory: ownedHistory }
}
