import { isJsonNumber, type JsonValue } from '@omne-harness-lite/content-blocks'
import { isOk, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { InvalidInput, SessionRef } from './types.ts'

export const invalidInput: InvalidInput = Object.freeze({ failure: 'invalidInput' })

export function object(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !isJsonNumber(value)
  )
}
export function checkSession(value: unknown): { readonly ok: SessionRef } | InvalidInput {
  const parsed = parseOpaqueIdentifier(value, 'SessionRef')
  return isOk(parsed) ? Object.freeze({ ok: parsed.ok }) : invalidInput
}
export function checkKey(value: unknown): value is string {
  return isOk(parseOpaqueIdentifier(value, 'LogKey'))
}
