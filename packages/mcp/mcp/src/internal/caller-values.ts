// The value trees a caller hands to a service method (SPEC R2): the arguments and the input
// responses of a call, and the input responses of a task. The transport writes them as given, so
// it takes them judged (contract T3); the service judges them before anything else.
import { judgeJsonValue, type JsonValue } from '@omne-harness/json-text'

/** The judged copy of a caller's value tree. A tree that fails is a caller defect: `TypeError`. */
export function judgedTree(value: JsonValue, what: string): JsonValue {
  const judged = judgeJsonValue(value)
  if ('rejected' in judged)
    throw new TypeError(
      `${what} fail judgeJsonValue: ${judged.rejected} at ${JSON.stringify(judged.path)}`,
    )
  return judged.ok
}
