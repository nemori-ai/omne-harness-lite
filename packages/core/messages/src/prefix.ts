import type {
  Message,
  LogPrefixView,
  SilencedBlockRef,
  CompactionMessage,
  CompactionInputs,
  CompactionListJudgment,
  PairingJudgment,
  ToolMessage,
  ToolInternalMessage,
  SystemReminderMessage,
  AssistantMessage,
} from './types.ts'
import { locateBlock } from './blocks.ts'

/** S-28: caller supplies a complete consistent prefix; timestamps are never read. */
export function isReadable(ref: SilencedBlockRef, prefix: LogPrefixView): boolean {
  const message = prefix.find(item => item.id === ref.messageId)
  if (message === undefined) return false
  const located = locateBlock(ref.blockId, message.blocks)
  if (located === undefined || located.path.some(block => !block.visibility.toModel)) return false
  return !prefix.some(
    item =>
      item.type === 'compaction' &&
      item.silenced.some(
        named =>
          named.messageId === ref.messageId &&
          located.path.some(block => block.id === named.blockId),
      ),
  )
}

/** S-29 ③⑤⑥. Representation (including forward references) must pass first. */
export function judgeCompactionList(
  c: CompactionMessage,
  prefix: LogPrefixView,
  inputs: CompactionInputs,
): CompactionListJudgment {
  // Empty lists satisfy all item predicates without external inputs.
  if (c.silenced.length === 0) return Object.freeze({ valid: true })
  if (!namedBlocksExist(c, prefix)) return Object.freeze({ valid: false, rule: 3 })
  if (namesPendingBlocks(c, prefix, inputs)) return Object.freeze({ valid: false, rule: 5 })
  const last = inputs.lastModelRequestPrefixLength
  if (namesAfterLastRequest(c, prefix, last)) return Object.freeze({ valid: false, rule: 6 })
  const missing: ('pending_card_blocks' | 'last_model_request')[] = []
  if (inputs.pendingCardBlocks === undefined) missing.push('pending_card_blocks')
  if (last === undefined || (last !== null && !validRequestPrefixLength(last, prefix.length)))
    missing.push('last_model_request')
  return missing.length === 0
    ? Object.freeze({ valid: true })
    : Object.freeze({ undetermined: Object.freeze(missing) })
}
function namedBlocksExist(c: CompactionMessage, prefix: LogPrefixView): boolean {
  for (const ref of c.silenced) {
    const message = prefix.find(item => item.id === ref.messageId)
    if (message === undefined || locateBlock(ref.blockId, message.blocks) === undefined)
      return false
  }
  return true
}
function namesPendingBlocks(
  c: CompactionMessage,
  prefix: LogPrefixView,
  inputs: CompactionInputs,
): boolean {
  for (const ref of c.silenced) {
    const message = prefix.find(item => item.id === ref.messageId)
    if (
      message?.type === 'tool' &&
      message.blocks[0].outcome === 'backgrounded' &&
      !prefix.some(item => isBackgroundEnding(item, message.callId))
    )
      return true
    const located = message === undefined ? undefined : locateBlock(ref.blockId, message.blocks)
    if (
      located !== undefined &&
      inputs.pendingCardBlocks?.some(
        pending =>
          pending.messageId === ref.messageId &&
          located.path.some(block => block.id === pending.blockId),
      )
    )
      return true
  }
  return false
}
function validRequestPrefixLength(last: number, length: number): boolean {
  return Number.isSafeInteger(last) && last >= 0 && last <= length
}
function namesAfterLastRequest(
  c: CompactionMessage,
  prefix: LogPrefixView,
  last: number | null | undefined,
): boolean {
  return (
    last === null ||
    (last !== undefined &&
      validRequestPrefixLength(last, prefix.length) &&
      c.silenced.some(ref => prefix.findIndex(item => item.id === ref.messageId) >= last))
  )
}

/** S-32. This checks a candidate against a consistent prefix; it never appends. */
export function judgePairing(message: Message, prefix: LogPrefixView): PairingJudgment {
  if (prefix.some(item => item.id === message.id)) return Object.freeze({ valid: false, rule: 1 })
  switch (message.type) {
    case 'system':
      return Object.freeze({ valid: false, rule: 7 })
    case 'tool':
    case 'tool_internal':
      return toolPairing(message, prefix)
    case 'assistant':
      return assistantPairing(message, prefix)
    case 'system_reminder':
      return backgroundPairing(message, prefix)
    case 'compaction':
      return message.silenced.length === 0
        ? Object.freeze({ valid: true })
        : Object.freeze({ undetermined: 'compaction_list' })
    case 'user':
      return Object.freeze({ valid: true })
  }
}
function assistantPairing(message: AssistantMessage, prefix: LogPrefixView): PairingJudgment {
  return prefix.some(item => item.type === 'assistant' && item.response === message.response)
    ? Object.freeze({ valid: false, rule: 5 })
    : Object.freeze({ valid: true })
}
function toolPairing(
  message: ToolMessage | ToolInternalMessage,
  prefix: LogPrefixView,
): PairingJudgment {
  const rule = message.type === 'tool' ? 2 : 3
  const hasCompleteCall = prefix.some(
    item =>
      item.type === 'assistant' &&
      item.blocks.some(
        block => block.kind === 'tool_call' && block.complete && block.callId === message.callId,
      ),
  )
  if (
    !hasCompleteCall ||
    prefix.some(item => item.type === message.type && item.callId === message.callId)
  )
    return Object.freeze({ valid: false, rule })
  return Object.freeze({ valid: true })
}
function backgroundPairing(message: SystemReminderMessage, prefix: LogPrefixView): PairingJudgment {
  if (
    message.source.kind === 'background_execution_finished' ||
    message.source.kind === 'background_execution_interrupted'
  ) {
    const callId = message.source.callId
    if (
      !prefix.some(
        item =>
          item.type === 'tool' &&
          item.callId === callId &&
          item.blocks[0].outcome === 'backgrounded',
      ) ||
      prefix.some(item => isBackgroundEnding(item, callId))
    )
      return Object.freeze({ valid: false, rule: 4 })
  }
  return Object.freeze({ valid: true })
}
function isBackgroundEnding(message: Message, callId: string): boolean {
  return (
    message.type === 'system_reminder' &&
    (message.source.kind === 'background_execution_finished' ||
      message.source.kind === 'background_execution_interrupted') &&
    message.source.callId === callId
  )
}
