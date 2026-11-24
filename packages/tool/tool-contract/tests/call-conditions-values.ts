import type { JsonValue } from '@omne-harness/json-text'
import {
  defineToolOperation,
  type ToolMessageContentBlock,
  type ToolOperation,
  type ToolOperationParameters,
} from '@omne-harness/tool-contract/provider'
import { ordinaryAuthor, ordinaryReturns, parameters } from './tool-values.ts'

type Declared = Extract<ToolOperationParameters, { kind: 'declared' }>

export function ordinaryOperation(): ToolOperation<null, ToolMessageContentBlock> {
  const defined = defineToolOperation<JsonValue, unknown, null, ToolMessageContentBlock, Declared>({
    parameters: { kind: 'declared', value: parameters() },
    returns: ordinaryReturns,
    author: ordinaryAuthor(),
  })
  if (!('ok' in defined)) throw new Error(defined.failure.field)
  return defined.ok
}
