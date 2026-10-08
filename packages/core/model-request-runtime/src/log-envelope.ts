import { copyJsonValue, type JsonValue } from '@omne-harness-lite/content-blocks'
import { checkLogPayload, factLogPayload, messageLogPayload } from '@omne-harness-lite/session-log'
import type { Message } from '@omne-harness-lite/messages'
import { modelLogFormat, object } from './log-codec-key.ts'
import type { ModelLogCategory } from './log-codec-value.ts'

export const MODEL_LOG_OWNER = 'model-request-runtime'
export interface ModelLogEnvelope {
  readonly format: string
  readonly category: ModelLogCategory
  readonly value: JsonValue
}
export function encodeModelLogEnvelope(
  format: string,
  category: ModelLogCategory,
  value: JsonValue,
  message: Message | null,
): JsonValue {
  const payload =
    category === 'message' && message !== null
      ? messageLogPayload(message)
      : factLogPayload(MODEL_LOG_OWNER, format, { category, value })
  const copy = copyJsonValue(payload)
  if ('failed' in copy) throw new Error('owned model envelope is not JSON')
  return copy.ok
}
/** Only current explicit owner envelopes are readable; old anonymous model wrappers are retired. */
export function readModelLogEnvelope(
  value: unknown,
):
  | { readonly kind: 'model'; readonly envelope: ModelLogEnvelope }
  | { readonly kind: 'other' }
  | { readonly failure: 'invalidInput' } {
  const checked = checkLogPayload(value)
  if ('failure' in checked) return checked
  if (checked.kind === 'message') {
    const copy = copyJsonValue(checked.payload.value)
    if ('failed' in copy) throw new Error('owned message is not JSON')
    return {
      kind: 'model',
      envelope: { format: modelLogFormat, category: 'message', value: copy.ok },
    }
  }
  if (checked.kind !== 'fact' || checked.payload.owner !== MODEL_LOG_OWNER) return { kind: 'other' }
  return readModelFact(checked.payload.version, checked.payload.value)
}
function readModelFact(format: string, fact: JsonValue): ReturnType<typeof readModelLogEnvelope> {
  if (
    !object(fact) ||
    Object.keys(fact).length !== 2 ||
    !Object.hasOwn(fact, 'value') ||
    (fact.category !== 'record' && fact.category !== 'response') ||
    fact.value === undefined
  )
    return { failure: 'invalidInput' }
  return { kind: 'model', envelope: { format, category: fact.category, value: fact.value } }
}
