// The tool calls of the active Run that have no tool message yet, and the tool messages that the
// end of the Run writes for them (SPEC "Run 结束时关上未答的调用").
//
// A provider takes a history only when every tool call that the model sees has a tool message. A
// call is answered by its own outcome, which the loop of the Run hands over while the Run is
// active, or by the end of its Run. Session owns the end of a Run, and a terminal Run takes no
// message, so the commit that writes the terminal writes the tool messages of the calls that are
// still unanswered. The message states what the caller knows: the Run ended before the call
// returned. What the tool did after that belongs to the tool.
import type { Message } from '@omne-harness/message'
import type { DurableEvidence } from './identity.ts'
import type { RunTerminal, WorkSnapshot } from './values.ts'
import { encodeEntry } from './entries.ts'
import { digestOf } from './operations.ts'
import type { EncodedEntry } from './judgments.ts'
import type { HistoryEntry } from './faces.ts'

type MessageBlock = Message['blocks'][number]
type CallBlock = Extract<MessageBlock, { kind: 'tool_call' | 'tool_call_unparsed' }>

/** A block that writes a tool call which a tool message answers. */
export function writesCall(block: MessageBlock): block is CallBlock {
  return block.kind === 'tool_call' || block.kind === 'tool_call_unparsed'
}

/**
 * The unanswered calls after `message`. An assistant message adds the calls that the model sees; a
 * tool message removes the call its marker names. Every other message leaves them as they are.
 */
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

const REASON: Readonly<Record<RunTerminal['outcome'], string>> = {
  cancelled:
    'the run was cancelled before the call returned. The tool was asked to stop. It may have had effects before it stopped.',
  failed: 'the run failed before the call returned. It may have had effects.',
  completed: 'the run ended before the call returned. It may have had effects.',
}

function closingMessage(terminal: RunTerminal, callId: string): Message {
  const visibility = { toHuman: true, toModel: true }
  const id = `msg_${digestOf({ run: terminal.run, callId }).slice(0, 40)}_tool`
  // The ids are derived, so naming the brands is the cast.
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

/** The tool messages that the terminal of the active Run writes before it, one per unanswered call. */
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
