import {
  judgeContentBlock,
  validate,
  type BlockId,
  type JsonValue,
  type ResultContentBlock,
} from '@omne-harness-lite/content-blocks'
import { copyJson } from './json.ts'
import { judgeToolReturn } from './judge.ts'
import { validate as validateReturn } from './schema.ts'
import type { Offload, ToolResult } from './types.ts'

interface WireResult {
  readonly content: readonly JsonValue[]
  readonly offload?: {
    readonly raw: Offload['raw']
    readonly summary?: readonly [JsonValue, ...JsonValue[]]
  }
  readonly attachments?: ToolResult['attachments']
}
function isWireResult(value: JsonValue): value is JsonValue & WireResult {
  return typeof value !== 'string' && validateReturn('ToolReturn', value).valid
}
function resultBlock(value: JsonValue): ResultContentBlock {
  const result = judgeContentBlock(value)
  if ('rejected' in result || result.ok.kind === 'tool_call')
    throw new Error('admitted return block failed branding')
  return result.ok
}

/** S20: the runtime supplies identity; a JSON-looking string remains text. */
export function toolResultOf(returned: unknown, blockId: BlockId): ToolResult {
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
  if (copied === undefined || 'rejected' in judgeToolReturn(copied) || !isWireResult(copied))
    throw new TypeError('valid ToolReturn required')
  const offload = copied.offload
  return Object.freeze({
    content: Object.freeze(copied.content.map(resultBlock)),
    ...(offload === undefined
      ? {}
      : {
          offload: Object.freeze({
            raw: offload.raw,
            ...(offload.summary === undefined
              ? {}
              : {
                  summary: Object.freeze([
                    resultBlock(offload.summary[0]),
                    ...offload.summary.slice(1).map(resultBlock),
                  ] as const),
                }),
          }),
        }),
    ...(copied.attachments === undefined ? {} : { attachments: copied.attachments }),
  })
}
