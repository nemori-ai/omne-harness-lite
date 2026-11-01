// Fixed history for the default-strategy tests: plain messages, a tool call with its result, and a
// tool result whose body is large. Built through the real judges so a shape the judges refuse
// fails the fixture, not a later assertion.
import { judgeBlockIdentity, type BlockId } from '@omne-harness/content-block'
import {
  judgeMessage,
  parseMessageId,
  parseRecordEntryRef,
  type CoveredEntry,
  type Message,
  type RecordEntryRef,
} from '@omne-harness/message'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeHistorySequence,
  type HistoryRow,
  type TenantModelCall,
} from '@omne-harness/request-context-contract'

const visibility = { toModel: true, toHuman: true }

export function blockId(raw: string): BlockId {
  const judged = judgeBlockIdentity({ id: raw, visibility })
  if ('rejected' in judged) throw new Error(`Block identity refused: ${raw}`)
  return judged.ok.id
}
export function textPart(text: string, id: string) {
  return { kind: 'text' as const, id: blockId(id), visibility, text }
}
function admitted(value: unknown): Message {
  const judged = judgeMessage(value)
  if ('rejected' in judged) throw new Error(`Message refused: ${judged.rejected}`)
  return judged.ok
}
function messageId(index: number): string {
  const parsed = parseMessageId(`msg_${String(index).padStart(22, 'a')}`)
  if (!parsed.ok) throw new Error('Message id refused')
  return parsed.value
}
export function userMessage(index: number, text = 'hello'): Message {
  return admitted({
    role: 'user',
    id: messageId(index),
    blocks: [textPart(text, `u${index}`)],
  })
}
export function assistantCall(index: number, callId: string): Message {
  return admitted({
    role: 'assistant',
    id: messageId(index),
    blocks: [
      {
        kind: 'tool_call',
        id: blockId(`a${index}`),
        visibility,
        callId,
        name: 'read_file',
        arguments: { kind: 'null' },
      },
    ],
  })
}
export function toolResult(index: number, callId: string, body: string): Message {
  return admitted({
    role: 'tool',
    id: messageId(index),
    blocks: [
      { kind: 'tool_result', id: blockId(`m${index}`), visibility, callId },
      textPart(body, `t${index}`),
    ],
  })
}
export function entryRef(index: number): RecordEntryRef {
  const parsed = parseRecordEntryRef(`entry:${index}`)
  if (parsed === null) throw new Error('Entry refused')
  return parsed
}
export function covered(index: number, message: Message | null): CoveredEntry {
  return { ref: entryRef(index), message }
}
export function historyRow(
  index: number,
  message: Message,
  sourceCall?: TenantModelCall,
): HistoryRow {
  const seq = decodeHistorySequence(String(index))
  if ('failure' in seq) throw new Error('Sequence refused')
  return {
    seq: seq.ok,
    entry: entryRef(index),
    bytes: '5',
    prefixDigest: `chain:${index}`,
    message,
    ...(sourceCall === undefined ? {} : { sourceCall }),
  } as HistoryRow
}
export function tenantOf(account = '0'): TenantId {
  const parsed = tenantCodec.parse(
    `{"organization":"org_00000000000000000000000000","account":"acc_${account.padStart(26, '0')}"}`,
  )
  if (!parsed.ok) throw new Error('Tenant fixture')
  return parsed.value
}
