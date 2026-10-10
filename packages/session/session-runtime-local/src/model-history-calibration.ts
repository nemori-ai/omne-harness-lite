import {
  inspectSettlementPrefixEntries,
  modelLogJsonEqual,
  type CurrentHistoryReaders,
  type InspectedModelLogEntry,
  type LocatedCalibrationCandidate,
  type ModelHistorySelector,
  type SettlementPrefix,
} from '@omne-harness-lite/model-request-runtime'
import type { Message } from '@omne-harness-lite/messages'

function selectedEntry(
  prefix: SettlementPrefix,
  selector: ModelHistorySelector,
): InspectedModelLogEntry | undefined {
  const selected = inspectSettlementPrefixEntries({ prefix, selector })
  return 'ok' in selected && selected.ok.length === 1 ? selected.ok[0] : undefined
}
function selectedCandidate(
  message: Extract<Message, { type: 'assistant' }>,
  messageIndex: number,
  messageEntry: InspectedModelLogEntry,
  prefix: SettlementPrefix,
): LocatedCalibrationCandidate | undefined {
  const responseEntry = selectedEntry(prefix, { kind: 'response', id: message.response }),
    dispatchedEntry = selectedEntry(prefix, { kind: 'dispatchResponse', id: message.response })
  const response = responseEntry?.captured.judgedResponse
  if (!responseEntry || !dispatchedEntry || !response || !response.reply) return
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
  const inspected = inspectSettlementPrefixEntries({
    prefix,
    selector: { kind: 'position', position: 0 },
  })
  if (!('ok' in inspected)) return { sourceUnavailable: true }
  const selectedSources = [],
    candidates: LocatedCalibrationCandidate[] = []
  for (const [messageIndex, message] of messages.entries()) {
    const source = selectedEntry(prefix, { kind: 'message', id: message.id })
    if (!source || !modelLogJsonEqual(source.captured.message, message))
      return { sourceUnavailable: true }
    selectedSources.push({ messageIndex, entry: source.entry })
    if (message.type === 'assistant') {
      const candidate = selectedCandidate(message, messageIndex, source, prefix)
      if (!candidate) return { sourceUnavailable: true }
      candidates.push(candidate)
    }
  }
  return { selectedSources, candidates: candidates.reverse() }
}
