import type { JsonValue } from '@omne-harness/json-text'
import { isObject, type JsonObject } from './json.ts'

export type ActionArgs = JsonObject

export function isActionArgs(value: JsonValue): value is ActionArgs {
  return isObject(value)
}
