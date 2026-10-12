import { copyJsonValue, isJsonNumber, type JsonValue } from '@omne-harness-lite/content-blocks'
import { prepareToolJournalEntry } from '@omne-harness-lite/tool-execution-runtime'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { checkKey } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { ToolResultInput, ToolResultFailure } from './tool-result-types.ts'
import { checkedResultSource } from './model-result-values.ts'
import { InvalidStateInput } from './state-values.ts'
import { runtimeSemantic } from './runtime-values.ts'

export class ToolCustodyRefusal extends Error {
  constructor(readonly failure: ToolResultFailure['failure']) {
    super(failure)
  }
}
export function object(value: unknown): value is Record<string, JsonValue> {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
export function ownToolResult(value: ToolResultInput, scope: SessionScope, limit: number) {
  const copy = copyJsonValue(value)
  if ('failed' in copy || !object(copy.ok)) throw new InvalidStateInput()
  const data = copy.ok
  checkInputShape(data)
  const input = data as unknown as ToolResultInput
  const intent = prepareToolJournalEntry({
    origin: input.original.origin,
    value: {
      kind: 'execution_intended',
      revision: 1,
      ref: input.original.ref,
      origin: input.original.origin,
      input: null,
    },
  })
  if ('invalid' in intent || !object(data.terminal)) throw new InvalidStateInput()
  if (
    !tenantIdEquals(input.original.ref.tenant, scope.tenant) ||
    input.original.ref.session !== scope.session
  )
    throw new ToolCustodyRefusal('invalidSource')
  runtimeSemantic(input, limit)
  return { ...input, source: checkedResultSource(input.source, scope) }
}
function checkInputShape(data: Record<string, JsonValue>) {
  if (Object.keys(data).length !== 4 || !checkKey(data.resultKey) || !object(data.original))
    throw new InvalidStateInput()
  const original = data.original
  if (
    Object.keys(original).length !== 5 ||
    !checkKey(original.adoption) ||
    !checkKey(original.executionGeneration) ||
    !checkKey(original.originalPosition)
  )
    throw new InvalidStateInput()
}
