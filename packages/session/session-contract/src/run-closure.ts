import type { Message } from '@omne-harness/message'
import type { DurableEvidence } from './identity.ts'
import type { RunTerminal, WorkSnapshot } from './values.ts'
import { encodeEntry } from './entries.ts'
import { digestOf } from './operations.ts'
import type { EncodedEntry } from './judgments.ts'
import type { HistoryEntry } from './faces.ts'

type MessageBlock = Message['blocks'][number]
type CallBlock = Extract<MessageBlock, { kind: 'tool_call' | 'tool_call_unparsed' }>

export function writesCall(block: MessageBlock): block is CallBlock {
  return block.kind === 'tool_call' || block.kind === 'tool_call_unparsed'
}

export function unansweredAfter(open: readonly string[], message: Message): readonly string[] {
  if (message.role === 'assistant') {
    const written = message.blocks
      .filter(writesCall)
      .filter(block => block.visibility.toModel && !open.includes(block.callId))
      .map(block => block.callId)
    return written.length === 0 ? open : [...open, ...written]
  }
  if (message.role !== 'tool') return open
  const marker = message.blocks[0]
  if (marker?.kind !== 'tool_result' || !open.includes(marker.callId)) return open
  return open.filter(callId => callId !== marker.callId)
}

export function trackCalls(draft: { unansweredCalls?: readonly string[] }, message: Message): void {
  const open = draft.unansweredCalls ?? []
  const next = unansweredAfter(open, message)
  if (next !== open) draft.unansweredCalls = next
}

export function hasUnansweredCalls(snapshot: { unansweredCalls?: readonly string[] }): boolean {
  return (snapshot.unansweredCalls ?? []).length > 0
}

const REASON: Readonly<Record<RunTerminal['outcome'], string>> = {
  cancelled:
    'the run was cancelled before the call returned. The tool was asked to stop. It may have had effects before it stopped.',
  failed: 'the run failed before the call returned. It may have had effects.',
  completed: 'the run ended before the call returned. It may have had effects.',
}

function closingMessage(terminal: RunTerminal, callId: string): Message {
  const visibility = { toHuman: true, toModel: true }
  const id = `msg_${digestOf({ run: terminal.run, callId }).slice(0, 40)}_tool`
  return {
    id,
    role: 'tool',
    blocks: [
      { kind: 'tool_result', id: `${callId}/result`, visibility, callId },
      {
        kind: 'text',
        id: `${callId}/run-ended`,
        visibility,
        text: `No result of this call is in the conversation: ${REASON[terminal.outcome]} Do not assume that the call completed or was approved.`,
      },
    ],
  } as unknown as Message
}

export function closingEntries(
  snapshot: WorkSnapshot,
  terminal: RunTerminal,
  source: DurableEvidence,
  origin: HistoryEntry['origin'],
): EncodedEntry[] {
  return (snapshot.unansweredCalls ?? []).map(callId =>
    encodeEntry(
      {
        kind: 'message.tool',
        message: closingMessage(terminal, callId),
        source,
        admission: null,
        consumption: null,
        participation: null,
      },
      origin,
    ),
  )
}
