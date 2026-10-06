import { modalityOf, type ContentBlock, type Modality } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { judgeMessage, type LoggedMessage, type Message } from '@omne-harness-lite/messages'
import type {
  CalibrationHistoryResult,
  CurrentHistoryReaders,
  LocatedCalibrationCandidate,
  SettlementPrefix,
  SelectionProjection,
  SelectionCompatibility,
} from '@omne-harness-lite/model-request-runtime-local'
import {
  captureModelLogValue,
  decodeModelLogKey,
  inspectModelLogEntry,
  modelLogJsonEqual,
} from '@omne-harness-lite/model-request-runtime'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime-local'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import type { LogEntry } from '@omne-harness-lite/session-log'
import { inspectRunnerConclusion } from '@omne-harness-lite/loop-extension-runner'
import { toolDriverAll } from './tool-driver-codec.ts'
import { readToolDriverHistory } from './tool-driver-history.ts'

/** This deliberately limited local fixture selects one actual fenced Run/attempt. */
export interface ControlledSingleRunSelection {
  readonly run: string
  readonly attempt: number
}

/** Keep the original entry for each selected message; a response id alone is not a source proof. */
export function messagePrefixWithSources(
  prefix: SettlementPrefix,
  selectedRun?: ControlledSingleRunSelection,
  ownerGeneration?: string,
):
  | {
      readonly messages: readonly LoggedMessage[]
      readonly selectedMessageSources: readonly {
        readonly messageIndex: number
        readonly entry: LogEntry
      }[]
    }
  | { readonly unavailable: true } {
  if (
    ownerGeneration !== undefined &&
    (selectedRun === undefined ||
      prefix.entries.some(entry => entry.readKeys.includes(toolDriverAll)))
  ) {
    const history = readToolDriverHistory({
      scope: { tenant: prefix.binding.tenant, session: prefix.binding.session },
      ownerGeneration,
      entries: prefix.entries,
      tail: prefix.tail,
    })
    if ('unavailable' in history) return { unavailable: true }
    const selected = history.models.entries.flatMap(record =>
      record.captured.message && record.captured.message.type !== 'system'
        ? [{ message: record.captured.message, entry: record.entry }]
        : [],
    )
    return {
      messages: selected.map(record => record.message),
      selectedMessageSources: selected.map((record, messageIndex) => ({
        messageIndex,
        entry: record.entry,
      })),
    }
  }
  const messages: LoggedMessage[] = []
  const selectedMessageSources: { readonly messageIndex: number; readonly entry: LogEntry }[] = []
  let started = false
  for (const entry of prefix.entries) {
    const runner = inspectRunnerConclusion({
      session: prefix.binding.session,
      tenant: prefix.binding.tenant,
      entry,
    })
    if ('invalid' in runner) return { unavailable: true }
    if ('conclusion' in runner) {
      if (
        (selectedRun === undefined && (entry.run !== undefined || entry.attempt !== undefined)) ||
        (selectedRun !== undefined &&
          (entry.run !== selectedRun.run ||
            entry.attempt === undefined ||
            ExactDecimal.from(entry.attempt).compare(ExactDecimal.from(selectedRun.attempt)) !==
              0 ||
            !started))
      )
        return { unavailable: true }
      continue
    }
    if (
      (entry.run === undefined) !== (entry.attempt === undefined) ||
      (entry.run !== undefined &&
        (selectedRun === undefined ||
          entry.attempt === undefined ||
          entry.run !== selectedRun.run ||
          ExactDecimal.from(entry.attempt).compare(ExactDecimal.from(selectedRun.attempt)) !== 0))
    )
      return { unavailable: true }
    const keys = entry.readKeys.map(decodeModelLogKey)
    const message = keys.some(key => 'ok' in key && key.ok.kind === 'messages')
    const response = keys.some(key => 'ok' in key && key.ok.kind === 'response')
    const checked = inspectModelLogEntry({
      session: prefix.binding.session,
      tenant: prefix.binding.tenant,
      entry,
      purpose: { kind: message ? 'message' : response ? 'response' : 'record' },
      messagePrefix: messages,
    })
    // Assistant messages require persisted-response pairing: validate the complete value and its original response.
    if ('invalidValue' in checked && message) {
      const captured = captureModelLogValue({
        category: 'message',
        input: {
          kind: 'value',
          value:
            entry.payload !== null &&
            typeof entry.payload === 'object' &&
            !Array.isArray(entry.payload) &&
            'value' in entry.payload
              ? entry.payload.value
              : null,
        },
      })
      if ('invalidValue' in captured || captured.ok.message?.type !== 'assistant')
        return { unavailable: true }
      const assistant = captured.ok.message
      const originals = prefix.entries.filter(candidate =>
        candidate.readKeys.some(key => {
          const decoded = decodeModelLogKey(key)
          return (
            'ok' in decoded &&
            decoded.ok.kind === 'response' &&
            decoded.ok.response === assistant.response
          )
        }),
      )
      if (originals.length !== 1 || originals[0] === undefined) return { unavailable: true }
      const original = originals[0]
      const responseCapture = inspectModelLogEntry({
        session: prefix.binding.session,
        tenant: prefix.binding.tenant,
        entry: original,
        purpose: { kind: 'response' },
        messagePrefix: messages,
      })
      if ('invalidValue' in responseCapture) return { unavailable: true }
      const paired = inspectModelLogEntry({
        session: prefix.binding.session,
        tenant: prefix.binding.tenant,
        entry,
        purpose: { kind: 'persistedMessage', response: responseCapture.ok.captured },
        messagePrefix: messages,
      })
      if (
        'invalidValue' in paired ||
        paired.ok.captured.message === null ||
        paired.ok.captured.message.type === 'system'
      )
        return { unavailable: true }
      if (entry.run !== undefined && !started) return { unavailable: true }
      selectedMessageSources.push({ messageIndex: messages.length, entry })
      messages.push(paired.ok.captured.message)
    } else {
      if ('invalidValue' in checked) return { unavailable: true }
      const value = checked.ok.captured.message
      if (value === null && entry.run !== undefined && !started) return { unavailable: true }
      if (value === null && entry.run === undefined && started) return { unavailable: true }
      if (value !== null) {
        if (value.type === 'system' || !('ok' in judgeMessage(value))) return { unavailable: true }
        if (value.type === 'system_reminder' && value.source.kind === 'attempt_started') {
          if (
            selectedRun === undefined ||
            started ||
            entry.run !== selectedRun.run ||
            entry.attempt === undefined ||
            ExactDecimal.from(value.source.attempt).compare(ExactDecimal.from(entry.attempt)) !==
              0 ||
            value.source.reason !== 'first'
          )
            return { unavailable: true }
          started = true
        } else if (entry.run !== undefined && !started) return { unavailable: true }
        selectedMessageSources.push({ messageIndex: messages.length, entry })
        messages.push(value)
      }
    }
  }
  if (selectedRun !== undefined && !started) return { unavailable: true }
  return { messages, selectedMessageSources }
}

/** Decode the complete log prefix without imposing a demo-specific message/block whitelist. */
export function messagePrefix(
  prefix: SettlementPrefix,
  selectedRun?: ControlledSingleRunSelection,
  ownerGeneration?: string,
): { readonly messages: readonly LoggedMessage[] } | { readonly unavailable: true } {
  const history = messagePrefixWithSources(prefix, selectedRun, ownerGeneration)
  return 'unavailable' in history ? history : { messages: history.messages }
}

/** Interpret the demo's complete noRun message chain; source checks remain with the runtime. */
export function readDemoCalibrationHistory(
  prefix: SettlementPrefix,
  selectedMessages: readonly Message[],
  target: Parameters<CurrentHistoryReaders['calibration']>[2],
  selectedRun?: ControlledSingleRunSelection,
  ownerGeneration?: string,
): CalibrationHistoryResult {
  const toolOwned =
    ownerGeneration !== undefined &&
    prefix.entries.some(entry => entry.readKeys.includes(toolDriverAll))
  if (toolOwned) {
    const history = readToolDriverHistory({
      scope: { tenant: prefix.binding.tenant, session: prefix.binding.session },
      ownerGeneration: ownerGeneration!,
      entries: prefix.entries,
      tail: prefix.tail,
    })
    if ('unavailable' in history || target.run === undefined || target.attempt === undefined)
      return { sourceUnavailable: true }
    const run = history.runs.get(target.run)
    if (
      !run?.latest ||
      run.end ||
      ExactDecimal.from(run.latest.value.attempt).compare(ExactDecimal.from(target.attempt)) !== 0
    )
      return { sourceUnavailable: true }
  } else {
    // The default noRun reader never infers a Run's selected branch. Only a
    // construction-time owner can pass its actual single-Run selection here.
    if (selectedRun === undefined) {
      if (
        Object.hasOwn(target, 'run') ||
        Object.hasOwn(target, 'attempt') ||
        prefix.entries.some(entry => entry.run !== undefined || entry.attempt !== undefined)
      )
        return { sourceUnavailable: true }
    } else if (
      target.run !== selectedRun.run ||
      target.attempt === undefined ||
      ExactDecimal.from(target.attempt).compare(ExactDecimal.from(selectedRun.attempt)) !== 0
    )
      return { sourceUnavailable: true }
  }
  const decoded = messagePrefixWithSources(prefix, selectedRun, ownerGeneration)
  if ('unavailable' in decoded) return { sourceUnavailable: true }
  const selectedSources: {
    readonly messageIndex: number
    readonly entry: LogEntry | null
  }[] = []
  const selectedCandidates: LocatedCalibrationCandidate[] = []
  let sourceIndex = 0
  for (const [messageIndex, selected] of selectedMessages.entries()) {
    if (selected.type === 'system') {
      selectedSources.push({ messageIndex, entry: null })
      continue
    }
    const source = decoded.selectedMessageSources[sourceIndex]
    const original = decoded.messages[sourceIndex]
    if (source === undefined && original === undefined && selected.type === 'system_reminder') {
      // A request-local reminder after the whole durable chain has no durable source; the
      // runtime accepts a null entry only for exactly such a message, never for an ancestor.
      selectedSources.push({ messageIndex, entry: null })
      continue
    }
    if (source === undefined || original === undefined || !modelLogJsonEqual(selected, original))
      return { sourceUnavailable: true }
    sourceIndex++
    selectedSources.push({ messageIndex, entry: source.entry })
    if (selected.type !== 'assistant') continue

    const responseEntries = prefix.entries.filter(entry =>
      entry.readKeys.some(key => {
        const decodedKey = decodeModelLogKey(key)
        return (
          'ok' in decodedKey &&
          decodedKey.ok.kind === 'response' &&
          decodedKey.ok.response === selected.response
        )
      }),
    )
    if (responseEntries.length !== 1 || responseEntries[0] === undefined)
      return { sourceUnavailable: true }
    const responseEntry = responseEntries[0]
    const inspected = inspectModelLogEntry({
      session: prefix.binding.session,
      tenant: prefix.binding.tenant,
      entry: responseEntry,
      purpose: { kind: 'response' },
      messagePrefix: decoded.messages.slice(0, sourceIndex),
    })
    if ('invalidValue' in inspected || inspected.ok.captured.response === null)
      return { sourceUnavailable: true }
    const rawResponse = inspected.ok.captured.value
    if (!('ok' in judgeModelResponse(rawResponse))) return { sourceUnavailable: true }
    // The MR9 judge above checks the complete value before this type projection.
    const response = rawResponse as unknown as ModelResponse
    if (
      response.id !== selected.response ||
      response.replyDisposition !== 'persisted' ||
      response.reply === undefined ||
      !modelLogJsonEqual(response.reply, selected)
    )
      return { sourceUnavailable: true }
    const history = interpretCallHistory({ prefix, callId: response.call.callId })
    if (!('known' in history)) return { sourceUnavailable: true }
    const dispatch = history.known.dispatches.find(
      item =>
        item.response !== null &&
        modelLogJsonEqual(item.response.entry, responseEntry) &&
        modelLogJsonEqual(item.response.value, rawResponse),
    )
    if (dispatch === undefined) return { sourceUnavailable: true }
    if (
      !toolOwned &&
      selectedRun !== undefined &&
      (dispatch.dispatched.run !== selectedRun.run ||
        dispatch.dispatched.attempt === undefined ||
        ExactDecimal.from(dispatch.dispatched.attempt).compare(
          ExactDecimal.from(selectedRun.attempt),
        ) !== 0)
    )
      return { sourceUnavailable: true }
    selectedCandidates.push({
      origin: 'selected_reply',
      dispatchedEntry: dispatch.dispatched,
      responseEntry,
      messageEntry: source.entry,
      messageIndex,
      response,
      replaySelection: selected.blocks.map((_block, blockIndex) => ({
        sourceBlockIndex: blockIndex,
        messageIndex,
        blockIndex,
      })),
    })
  }
  if (sourceIndex !== decoded.messages.length) return { sourceUnavailable: true }
  const currentCall = interpretCallHistory({ prefix, callId: target.callId })
  if ('unavailable' in currentCall) return { sourceUnavailable: true }
  if (
    'absent' in currentCall &&
    ExactDecimal.from(target.dispatch).compare(ExactDecimal.from(1)) !== 0
  )
    return { sourceUnavailable: true }
  const retryCandidates: LocatedCalibrationCandidate[] = []
  if ('known' in currentCall) {
    if (
      ExactDecimal.from(target.dispatch).compare(
        ExactDecimal.from(currentCall.known.dispatches.length + 1),
      ) !== 0
    )
      return { sourceUnavailable: true }
    for (const dispatch of currentCall.known.dispatches) {
      if (
        selectedRun !== undefined &&
        (dispatch.dispatched.run !== selectedRun.run ||
          dispatch.dispatched.attempt === undefined ||
          ExactDecimal.from(dispatch.dispatched.attempt).compare(
            ExactDecimal.from(selectedRun.attempt),
          ) !== 0)
      )
        return { sourceUnavailable: true }
      if (ExactDecimal.from(dispatch.ordinal).compare(ExactDecimal.from(target.dispatch)) >= 0)
        return { sourceUnavailable: true }
      if (dispatch.response === null) return { sourceUnavailable: true }
      const rawResponse = dispatch.response.value
      if (!('ok' in judgeModelResponse(rawResponse))) return { sourceUnavailable: true }
      const response = rawResponse as unknown as ModelResponse
      if (response.reply !== undefined || response.replyDisposition !== undefined)
        return { sourceUnavailable: true }
      retryCandidates.push({
        origin: 'same_call_retry',
        dispatchedEntry: dispatch.dispatched,
        responseEntry: dispatch.response.entry,
        response,
        replaySelection: [],
      })
    }
  }
  const candidates = [...retryCandidates.reverse(), ...selectedCandidates.reverse()]
  if (candidates.length === 0) return { noObservation: true }
  return { selectedSources, candidates }
}
/** MP2 S-5 / CB3 S-6: project original model-visible blocks, without changing the messages. */
export async function historyProjection(
  prefix: SettlementPrefix,
  selectedRun?: ControlledSingleRunSelection,
  ownerGeneration?: string,
): Promise<SelectionProjection> {
  const history = messagePrefix(prefix, selectedRun, ownerGeneration)
  if ('unavailable' in history) return { unknown: true }
  const modalities = new Set<Modality>()
  function visit(blocks: readonly ContentBlock[]): void {
    for (const block of blocks) {
      if (!block.visibility.toModel) continue
      if (block.kind === 'tool_result') {
        visit(block.blocks)
        continue
      }
      if ('transcript' in block) continue
      const modality =
        block.kind === 'file'
          ? modalityOf(block.attachment.mediaType)
          : block.kind === 'voice'
            ? 'audio'
            : block.kind === 'image'
              ? 'image'
              : 'text'
      if (modality !== undefined) modalities.add(modality)
    }
  }
  for (const message of history.messages) visit(message.blocks)
  return { known: [...modalities] }
}
/** MP2 S-7: compatibility belongs to the selected profile's declared inputs. */
export const nativeCompatibility: SelectionCompatibility = (profile, projection) => {
  const blocked = projection.filter(modality => !profile.inputModalities.includes(modality))
  return blocked.length ? { blocked } : { ok: true }
}
