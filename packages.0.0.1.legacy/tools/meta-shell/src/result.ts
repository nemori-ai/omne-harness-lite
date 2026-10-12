import { contentBlockFromRepresentation } from '@omne-harness-lite/content-blocks'
import type { ToolResult } from '@omne-harness-lite/tool-definition'
import type { ShellBusinessFailure, ShellResultPayload } from './types.ts'

export function reply(value: ShellResultPayload, isError = false): ToolResult {
  const block = contentBlockFromRepresentation({
    id: 'shell-result',
    kind: 'text',
    visibility: { toHuman: true, toModel: true },
    text: JSON.stringify(value),
  })
  if (block.kind !== 'text') throw new TypeError('Invalid Shell result block')
  return { content: [block], ...(isError ? { isError: true } : {}) }
}
export function failure(
  reason: ShellBusinessFailure['reason'],
  detail?: ShellBusinessFailure['detail'],
): ToolResult {
  return reply({ kind: 'rejected', reason, ...(detail === undefined ? {} : { detail }) }, true)
}
