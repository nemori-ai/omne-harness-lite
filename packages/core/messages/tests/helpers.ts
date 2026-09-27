import {
  judgeMessage,
  type Message,
  type LoggedMessage,
  type CompactionMessage,
  type SilencedBlockRef,
} from '@omne-harness-lite/messages/v3'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
export const at = '2026-09-23T08:00:00Z'
export function text(id: string, toModel = true) {
  return { id, kind: 'text', visibility: { toHuman: true, toModel }, text: 'payload' }
}
export function accepted(value: unknown): Message {
  const result = judgeMessage(value)
  if ('rejected' in result) throw new Error(`invalid test fixture ${result.rejected}`)
  return result.ok
}
export function logged(value: unknown): LoggedMessage {
  const result = accepted(value)
  if (result.type === 'system') throw new Error('system is not a log fixture')
  return result
}
export function compact(
  id: string,
  refs: readonly { messageId: string; blockId: string }[],
): CompactionMessage {
  const message = accepted({
    id,
    type: 'compaction',
    blocks: [text(`${id}_summary`)],
    silenced: refs,
    createdAt: at,
  })
  if (message.type !== 'compaction') throw new Error('not compaction')
  return message
}
export function ref(messageId: string, blockId: string): SilencedBlockRef {
  const m = parseOpaqueIdentifier(messageId, 'MessageId'),
    b = parseOpaqueIdentifier(blockId, 'BlockId')
  if (!('ok' in m) || !('ok' in b)) throw new Error('invalid ref fixture')
  return { messageId: m.ok, blockId: b.ok }
}
export function tool(callId: string, outcome = 'completed', id = 'tool1', reason?: unknown) {
  return {
    id,
    type: 'tool',
    callId,
    createdAt: at,
    blocks: [
      {
        id: `${id}_result`,
        kind: 'tool_result',
        callId,
        outcome,
        visibility: { toHuman: true, toModel: true },
        blocks: [text(`${id}_nested`)],
        ...(reason === undefined ? {} : { reason }),
      },
    ],
  }
}
export function assistant(callId: string, id = 'assistant1', complete = true) {
  return {
    id,
    type: 'assistant',
    response: `${id}_response`,
    ending: complete ? 'complete' : 'interrupted_by_user',
    createdAt: at,
    blocks: [
      {
        id: `${id}_call`,
        kind: 'tool_call',
        callId,
        tool: 'invoke',
        complete,
        visibility: { toHuman: complete, toModel: complete },
        ...(complete ? { arguments: {} } : { rawArguments: '{' }),
      },
    ],
  }
}
export function finished(callId: string, id = 'finished1', interrupted = false) {
  return {
    id,
    type: 'system_reminder',
    nature: 'event',
    createdAt: at,
    source: {
      kind: interrupted ? 'background_execution_interrupted' : 'background_execution_finished',
      callId,
      ...(interrupted ? {} : { outcome: 'completed' }),
    },
    blocks: [
      {
        id: `${id}_result`,
        kind: 'tool_result',
        callId,
        outcome: interrupted ? 'failed' : 'completed',
        visibility: { toHuman: true, toModel: true },
        blocks: [],
        ...(interrupted ? { reason: { code: 'abnormal_interruption', text: 'lost' } } : {}),
      },
    ],
  }
}
