import {
  projectMessages,
  materializeMessages,
  type ProjectionOptions,
} from '@omne-harness-lite/model-message-projection'
import { inspectContextLogEntry } from '@omne-harness-lite/runtime-context-local'
import { inspectToolJournalEntry } from '@omne-harness-lite/tool-execution-runtime'
import { readAttemptStarted } from '@omne-harness-lite/session-runtime'
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
} from '@omne-harness-lite/model-request-runtime'
import {
  captureModelLogValue,
  decodeModelLogKey,
  inspectModelLogEntry,
  modelLogJsonEqual,
} from '@omne-harness-lite/model-request-runtime'
import { interpretCallHistory } from '@omne-harness-lite/model-request-runtime'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import type { LogEntry } from '@omne-harness-lite/session-log'
import { inspectRunnerConclusion } from '@omne-harness-lite/loop-extension-runner'
import { inspectDriverEntry, toolDriverAll } from './tool-driver-codec.ts'
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
  const scope = { tenant: prefix.binding.tenant, session: prefix.binding.session }
  if (selectedRun !== undefined) {
    let started = false
    for (const entry of prefix.entries) {
      const fact = readAttemptStarted(entry)
      if ('failure' in fact) return { unavailable: true }
      if (
        fact.kind === 'fact' &&
        fact.fact.run === selectedRun.run &&
        ExactDecimal.from(fact.fact.attempt).compare(ExactDecimal.from(selectedRun.attempt)) === 0
      ) {
        if (started) return { unavailable: true }
        started = true
      }
      if (
        entry.run !== undefined &&
        (entry.run !== selectedRun.run ||
          entry.attempt === undefined ||
          ExactDecimal.from(entry.attempt).compare(ExactDecimal.from(selectedRun.attempt)) !== 0 ||
          !started)
      )
        return { unavailable: true }
    }
    if (!started) return { unavailable: true }
  }
  const readers: NonNullable<ProjectionOptions['entryReaders']> = [
    entry => {
      const value = inspectContextLogEntry(scope, entry)
      return 'invalid' in value ? 'invalid' : 'unrelated' in value ? 'unrelated' : 'valid'
    },
    entry => {
      const value = inspectToolJournalEntry(scope, entry)
      return 'invalid' in value ? 'invalid' : 'unrelated' in value ? 'unrelated' : 'valid'
    },
    entry => {
      const value = inspectDriverEntry(scope, entry)
      return 'invalid' in value ? 'invalid' : 'unrelated' in value ? 'unrelated' : 'valid'
    },
    entry => {
      const value = inspectRunnerConclusion({ ...scope, entry })
      return 'invalid' in value ? 'invalid' : 'unrelated' in value ? 'unrelated' : 'valid'
    },
  ]
  const factReaders = new Map(
    ['runtime-context', 'tool-execution-runtime', 'demo-tool-driver', 'loop-extension-runner'].map(
      owner => [
        owner,
        (_value: unknown, entry: LogEntry) => {
          for (const reader of readers) if (reader(entry) === 'invalid') return 'invalid' as const
          return 'valid' as const
        },
      ],
    ),
  )
  // This stage projects durable history only. Request-side configuration is composed later;
  // external:null explicitly prevents this view from becoming a request cache.
  const computed = projectMessages(
    {
      source: prefix.source,
      entries: prefix.entries,
      rules: {
        version: 'demo-durable-history/1',
        external: null,
        system: [],
        pendingCardBlocks: null,
        lastModelRequestPrefixLength: null,
      },
    },
    { entryReaders: readers, factReaders },
  )
  if (!('projected' in computed)) return { unavailable: true }
  const materialized = materializeMessages(computed.projected)
  if (!('materialized' in materialized)) return { unavailable: true }
  const byPosition = new Map(
    prefix.entries.map(entry => [ExactDecimal.from(entry.position).toCanonicalString(), entry]),
  )
  const messages: LoggedMessage[] = [],
    selectedMessageSources: { messageIndex: number; entry: LogEntry }[] = []
  for (const [index, message] of materialized.materialized.entries()) {
    const source = materialized.sources[index]
    if (message.type === 'system' || source === undefined || source.position === null)
      return { unavailable: true }
    const entry = byPosition.get(ExactDecimal.from(source.position).toCanonicalString())
    if (entry === undefined) return { unavailable: true }
    selectedMessageSources.push({ messageIndex: messages.length, entry })
    messages.push(message)
  }
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
