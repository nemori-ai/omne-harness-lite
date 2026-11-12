// The arguments of one action call. `tools/call` takes a JSON object; any other JSON tree is a
// defect of the caller, which the service reports by throwing (SPEC R2).
import type { JsonValue } from '@omne-harness/json-text'
import { isObject, type JsonObject } from './json.ts'

/** The arguments of an action call: a JSON object. */
export type ActionArgs = JsonObject

/** True only for a JSON object. The guard does not repair a list or a scalar. */
export function isActionArgs(value: JsonValue): value is ActionArgs {
  return isObject(value)
}
