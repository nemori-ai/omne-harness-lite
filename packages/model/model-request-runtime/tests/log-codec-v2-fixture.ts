import type { JsonObject } from '@omne-harness-lite/content-blocks'
import * as codec from '@omne-harness-lite/model-request-runtime/log-codec/v2'
import type { OwnedLogEntry } from '@omne-harness-lite/session-log-jsonl'
import { response, session, tenant } from './log-codec-fixture.ts'

export const responseV5: JsonObject = {
  ...response,
  raw: { headers: { 'x-values': ['second', '', 'second', 'first'], 'x-single': '' } },
}
export function captureV2(category: codec.ModelLogCategory, value: unknown) {
  const result = codec.captureModelLogValue({ category, input: { kind: 'value', value } })
  if (!('ok' in result)) throw new Error(`v2 capture ${result.reason}`)
  return result.ok
}
export function prepareV2(
  category: codec.ModelLogCategory,
  value: unknown,
  purpose: codec.ModelLogPurpose,
): OwnedLogEntry {
  const result = codec.prepareModelLogEntry({
    session,
    shell: { tenant },
    captured: captureV2(category, value),
    purpose,
    messagePrefix: [],
  })
  if (!('ok' in result)) throw new Error(`v2 prepare ${result.reason}`)
  return result.ok
}
export function batchV2(value: JsonObject = responseV5): readonly OwnedLogEntry[] {
  const captured = captureV2('response', value)
  const r = prepareV2('response', value, { kind: 'response' })
  return value.replyDisposition === 'persisted'
    ? [prepareV2('message', value.reply, { kind: 'persistedMessage', response: captured }), r]
    : [r]
}
