import {
  inspectSettlementPrefixEntries,
  modelLogJsonEqual,
  type CurrentHistoryReaders,
  type InspectedModelLogEntry,
  type LocatedCalibrationCandidate,
} from '@omne-harness-lite/model-request-runtime'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import type { Message } from '@omne-harness-lite/messages'

function isResponse(value: unknown): value is ModelResponse {
  return 'ok' in judgeModelResponse(value)
}
type Index = Map<string, InspectedModelLogEntry | null>
function add(index: Index, key: string, entry: InspectedModelLogEntry) {
  index.set(key, index.has(key) ? null : entry)
}
function indexes(entries: readonly InspectedModelLogEntry[]) {
  const messages: Index = new Map(),
    responses: Index = new Map(),
    dispatches: Index = new Map()
  for (const entry of entries) {
    const value = entry.captured
    if (value.message) add(messages, value.message.id, entry)
    if (value.response) add(responses, value.response.id, entry)
    if (value.record?.kind === 'model_call_dispatched')
      add(dispatches, value.record.response, entry)
  }
  return { messages, responses, dispatches }
}
function selectedCandidate(
  message: Extract<Message, { type: 'assistant' }>,
  messageIndex: number,
  messageEntry: InspectedModelLogEntry,
  index: ReturnType<typeof indexes>,
): LocatedCalibrationCandidate | undefined {
  const responseEntry = index.responses.get(message.response),
    dispatchedEntry = index.dispatches.get(message.response)
  const response = responseEntry?.captured.response
  if (!responseEntry || !dispatchedEntry || !isResponse(response) || !response.reply) return
  const blocks = new Map(
    response.reply.blocks.map((block, sourceBlockIndex) => [block.id, { block, sourceBlockIndex }]),
  )
  const replaySelection: LocatedCalibrationCandidate['replaySelection'][number][] = []
  for (const [blockIndex, block] of (response.inputCalibration.outputGroup.kind === 'known'
    ? message.blocks
    : []
  ).entries()) {
    const original = blocks.get(block.id)
    if (!original || !modelLogJsonEqual(original.block, block)) return
    replaySelection.push({ sourceBlockIndex: original.sourceBlockIndex, messageIndex, blockIndex })
  }
  return {
    origin: 'selected_reply',
    messageEntry: messageEntry.entry,
    messageIndex,
    responseEntry: responseEntry.entry,
    dispatchedEntry: dispatchedEntry.entry,
    response,
    replaySelection,
  }
}

export const readSessionModelCalibration: CurrentHistoryReaders['calibration'] = (
  prefix,
  messages,
) => {
  const inspected = inspectSettlementPrefixEntries({ prefix })
  if (!('ok' in inspected)) return { sourceUnavailable: true }
  const index = indexes(inspected.ok)
  const selectedSources = [],
    candidates: LocatedCalibrationCandidate[] = []
  for (const [messageIndex, message] of messages.entries()) {
    const source = index.messages.get(message.id)
    if (!source || !modelLogJsonEqual(source.captured.message, message))
      return { sourceUnavailable: true }
    selectedSources.push({ messageIndex, entry: source.entry })
    if (message.type === 'assistant') {
      const candidate = selectedCandidate(message, messageIndex, source, index)
      if (!candidate) return { sourceUnavailable: true }
      candidates.push(candidate)
    }
  }
  return { selectedSources, candidates: candidates.reverse() }
}
