import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { Message } from '@omne-harness-lite/messages'
import { judgeModelResponse } from '@omne-harness-lite/model-response'
import type { LogEntry } from '@omne-harness-lite/session-log-jsonl'
import { interpretCallHistory } from './call-history.ts'
import { inspectCurrentModelLogPrefix } from './log-codec-settlement.ts'
import { modelLogJsonEqual } from './log-codec.ts'
import { interpretSettlementPrefix, settlementGenerationCurrent } from './settlement-prefix.ts'
import type { SettlementPrefix } from './settlement-prefix.ts'
import type { CurrentHistoryReaders } from './service-types.ts'
import type { PlanCalibration } from './types.ts'

export type AuthorizedCalibrationResult =
  { readonly calibration: PlanCalibration } | { readonly unavailable: true }

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
  target: {
    readonly callId: string
    readonly dispatch: import('@omne-harness-lite/content-blocks').JsonNumber
  },
  read: CurrentHistoryReaders['calibration'],
): AuthorizedCalibrationResult {
  if (!settlementGenerationCurrent(prefix.binding)) return { unavailable: true }
  let interpreted: ReturnType<CurrentHistoryReaders['calibration']>
  try {
    interpreted = read(prefix, messages, target)
  } catch {
    return { unavailable: true }
  }
  if ('sourceUnavailable' in interpreted)
    return { calibration: { kind: 'none', reason: 'source_unavailable' } }
  if ('noObservation' in interpreted)
    return { calibration: { kind: 'none', reason: 'no_observation' } }
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
      ) !== 0 ||
      dispatched.entry.run !== undefined ||
      dispatched.entry.attempt !== undefined ||
      response.entry.run !== undefined ||
      response.entry.attempt !== undefined
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
        attached.entry.run !== undefined ||
        attached.entry.attempt !== undefined ||
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
        candidate.response.reply !== undefined ||
        ordinal.compare(priorDispatch) >= 0 ||
        originalMembers.message !== null
      )
        return { unavailable: true }
      const history = interpretCallHistory({ prefix, callId: target.callId })
      if (
        !('known' in history) ||
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
    const observation = candidate.response.inputCalibration.observedInput
    const request = candidate.response.inputCalibration.requestInput
    const group = candidate.response.inputCalibration.outputGroup
    if (
      request.kind !== 'known' ||
      (observation.kind !== 'from_usage' && observation.kind !== 'upstream_total') ||
      group.kind !== 'known'
    )
      continue
    const outputBlocks =
      group.source === 'reply'
        ? candidate.response.reply?.blocks
        : group.source === 'delivered'
          ? candidate.response.delivered
          : []
    if (outputBlocks === undefined) return { unavailable: true }
    if (!Array.isArray(candidate.replaySelection)) return { unavailable: true }
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
    selectedObservation ??= {
      kind: 'observation',
      inputCalibration: candidate.response.inputCalibration,
      usage: candidate.response.usage,
      outputBlocks,
      replaySelection: candidate.replaySelection,
    }
  }
  return { calibration: selectedObservation ?? { kind: 'none', reason: 'no_observation' } }
}
