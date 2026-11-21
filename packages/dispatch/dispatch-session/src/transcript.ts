import { writeJsonText } from '@omne-harness/json-text'
import type { ModelViewRow } from '@omne-harness/session-contract'

type Message = ModelViewRow['message']
type Part = Message['blocks'][number]

const SAID_BY: Readonly<Record<Message['role'], string>> = {
  user: 'User',
  assistant: 'Assistant',
  tool: 'Tool result',
  tool_internal: 'Tool result',
  system_reminder: 'System reminder',
  compaction: 'Summary of the earlier conversation',
}

/** One part as text. A tool call is told, not handed on: nobody can go on with it. Null: the part says nothing here. */
function told(part: Part): string | null {
  if (!part.visibility.toModel) return null
  switch (part.kind) {
    case 'text':
      return part.text
    case 'tool_call':
      return `[called the tool ${part.name} with ${writeJsonText(part.arguments)}]`
    case 'tool_call_incomplete':
    case 'tool_call_unparsed':
      return `[called the tool ${part.name}]`
    case 'tool_result':
    case 'reasoning_state':
      return null
    default:
      return `[${part.kind}]`
  }
}

/** The messages a model saw, as one text: each under who said it, in their order. */
export function transcriptOf(messages: readonly Message[]): string {
  return messages
    .map(message => {
      const lines = message.blocks.map(told).filter(line => line !== null)
      return lines.length === 0 ? null : `${SAID_BY[message.role]}:\n${lines.join('\n')}`
    })
    .filter(said => said !== null)
    .join('\n\n')
}
