import { judgeJsonValue, type JsonValue } from '@omne-harness/json-text'

export function judgedTree(value: JsonValue, what: string): JsonValue {
  const judged = judgeJsonValue(value)
  if ('rejected' in judged)
    throw new TypeError(
      `${what} fail judgeJsonValue: ${judged.rejected} at ${JSON.stringify(judged.path)}`,
    )
  return judged.ok
}
