import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import type { IncompleteToolCallBlock, ToolCallBlock } from '@omne-harness-lite/content-blocks'
import type { OpenEvent } from '@omne-harness-lite/arrival-events'

export type ToolOpening = Extract<OpenEvent, { readonly kind: 'tool_call' }>

/** S-9/S-12: incomplete calls never enter the parameter parser. */
export function incompleteToolCall(
  opened: ToolOpening,
  rawArguments: string,
): IncompleteToolCallBlock {
  return Object.freeze({
    kind: 'tool_call',
    id: opened.id,
    visibility: Object.freeze({ toHuman: false, toModel: false }),
    complete: false,
    callId: opened.head.callId,
    tool: opened.head.tool,
    rawArguments,
  })
}

/** Only an accepted, untrimmed close with a legal model tool name reaches here. */
export function parseCollectedToolCall(opened: ToolOpening, rawArguments: string): ToolCallBlock {
  // S-10: the sole parameter read site. The raw empty string denotes an empty object.
  const parsed = readJsonStrict(rawArguments === '' ? '{}' : rawArguments)
  const identity = {
    kind: 'tool_call',
    id: opened.id,
    visibility: opened.visibility,
    complete: true,
    callId: opened.head.callId,
    tool: opened.head.tool,
  } as const
  return 'failed' in parsed
    ? Object.freeze({ ...identity, rawArguments, unparseable: true })
    : Object.freeze({ ...identity, arguments: parsed.ok })
}
