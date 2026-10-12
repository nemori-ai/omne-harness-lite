import { createHash } from 'node:crypto'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  isJsonNumber,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'

export function canonicalAdmissionArguments(value: JsonValue): string {
  if (isJsonNumber(value)) return ExactDecimal.from(value).toCanonicalString()
  if (Array.isArray(value)) return `[${value.map(canonicalAdmissionArguments).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const object = value as JsonObject
    return `{${Object.keys(object)
      .sort()
      .map(key => `${writeJsonLossless(key)}:${canonicalAdmissionArguments(object[key]!)}`)
      .join(',')}}`
  }
  return writeJsonLossless(value)
}
export function admissionArgumentDigest(args: JsonValue): string {
  return createHash('sha256').update(canonicalAdmissionArguments(args)).digest('hex')
}
