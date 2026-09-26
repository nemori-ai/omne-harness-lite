import { validate, type BlockId } from '@omne-harness-lite/content-blocks'
import { copyJson } from './json.ts'
import { isToolReturn } from './judge.ts'
import type { ToolReturn, ToolResult } from './types.ts'

/** S20: the runtime supplies identity; a JSON-looking string remains text. */
export function toolResultOf(returned: ToolReturn, blockId: BlockId): ToolResult {
  if (typeof returned === 'string') {
    if (!validate('BlockId', blockId).valid) throw new TypeError('runtime block id required')
    return Object.freeze({
      content: Object.freeze([
        Object.freeze({
          id: blockId,
          kind: 'text' as const,
          visibility: Object.freeze({ toHuman: true, toModel: true }),
          text: returned,
        }),
      ]),
    })
  }
  const copied = copyJson(returned)
  if (!isToolReturn(copied) || typeof copied === 'string')
    throw new TypeError('valid ToolReturn required')
  return copied
}
