import { createHash } from 'node:crypto'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  isJsonNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import type { ExecutionRef } from '@omne-harness-lite/tool-execution-runtime'
import type { createImmutableFiles } from './immutable-files.ts'

export function object(value: unknown): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
export function equal(left: JsonValue, right: JsonValue): boolean {
  if (isJsonNumber(left) && isJsonNumber(right))
    return ExactDecimal.from(left).compare(ExactDecimal.from(right)) === 0
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((value, i) => equal(value, right[i]!))
  if (!object(left) || !object(right)) return false
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.entries(left).every(
      ([key, value]) => Object.hasOwn(right, key) && equal(value, right[key]!),
    )
  )
}
export function same(left: unknown, right: unknown) {
  const a = copyJsonValue(left),
    b = copyJsonValue(right)
  return 'ok' in a && 'ok' in b && equal(a.ok, b.ok)
}
export const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
export function fileKey(ref: ExecutionRef, purpose: readonly string[]) {
  return digest(
    Buffer.from(
      JSON.stringify([
        ref.tenant.organization,
        ref.tenant.account,
        ref.session,
        ref.callId,
        ...purpose,
      ]),
    ),
  )
}
export function createRecords(files: Awaited<ReturnType<typeof createImmutableFiles>>) {
  const decode = (bytes: Uint8Array) => {
    try {
      const parsed = readJsonStrict(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      return 'ok' in parsed && object(parsed.ok) ? parsed.ok : 'unavailable'
    } catch {
      return 'unavailable'
    }
  }
  return Object.freeze({
    async read(key: string) {
      const bytes = await files.read(`${key}.json`)
      return typeof bytes === 'string' ? bytes : decode(bytes)
    },
    async publish(
      key: string,
      supplied: unknown,
    ): Promise<'recorded' | 'duplicate' | 'conflict' | 'unavailable'> {
      const captured = copyJsonValue(supplied)
      if ('failed' in captured || !object(captured.ok)) return 'unavailable'
      const existing = await files.read(`${key}.json`)
      if (existing === 'unavailable') return existing
      if (existing !== 'missing') {
        const value = decode(existing)
        if (value === 'unavailable') return value
        if (!equal(value, captured.ok)) return 'conflict'
        const confirmed = await files.publish(`${key}.json`, existing)
        return confirmed === 'duplicate' ? confirmed : 'unavailable'
      }
      const proposed = Buffer.from(writeJsonLossless(captured.ok))
      const result = await files.publish(`${key}.json`, proposed)
      if (result === 'published') return 'recorded'
      if (result !== 'conflict') return result
      // Another immutable publisher may have used an equivalent JSON representation.
      const raced = await files.read(`${key}.json`)
      if (typeof raced === 'string') return 'unavailable'
      const value = decode(raced)
      if (value === 'unavailable') return value
      if (!equal(value, captured.ok)) return 'conflict'
      return (await files.publish(`${key}.json`, raced)) === 'duplicate'
        ? 'duplicate'
        : 'unavailable'
    },
  })
}
