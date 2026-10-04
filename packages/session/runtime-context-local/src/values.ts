import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { createHash } from 'node:crypto'
import { copyJsonValue, isJsonNumber, readJsonStrict, writeJsonLossless, type JsonValue, type JsonObject } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
export function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
}
export function own(value: unknown): JsonValue {
  const copied = copyJsonValue(value)
  if ('failed' in copied) throw new TypeError('not JSON data')
  return copied.ok
}
function ordered(value: JsonValue): JsonValue {
  if (isJsonNumber(value)) {
    const canonical = readJsonStrict(ExactDecimal.from(value).toString())
    if ('failed' in canonical) throw new Error('invalid canonical number')
    return canonical.ok
  }
  if (Array.isArray(value)) return value.map(ordered)
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key]!)]))
  return value
}
/** Semantic data identity; object insertion order is not an input change. */
export function identity(value: unknown): string {
  return createHash('sha256').update(writeJsonLossless(ordered(own(value)))).digest('hex')
}
export function sameScope(a: SessionScope, b: SessionScope): boolean {
  return a.session === b.session && tenantIdEquals(a.tenant, b.tenant)
}
