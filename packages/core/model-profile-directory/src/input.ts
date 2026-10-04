import {
  copyJsonValue,
  isJsonNumber,
  isNonNegativeJsonInteger,
  jsonNumberSource,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  judgeModelProfileDocument,
  validate,
  type ModelProfileContent,
  type ModelProfileRef,
} from '@omne-harness-lite/model-profile'
import type { InvalidInput, OfficialManifest, ProfilePatch } from './types.ts'

export const invalid = (reason: InvalidInput['reason'] = 'malformed'): InvalidInput => ({
  failure: 'invalidInput',
  reason,
})
export function object(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
export function isContent(value: unknown): value is ModelProfileContent {
  return 'ok' in judgeModelProfileDocument('ModelProfileContent', value)
}
export function isRef(value: unknown): value is ModelProfileRef {
  return 'ok' in judgeModelProfileDocument('ModelProfileRef', value)
}
export function parseContent(input: unknown): ModelProfileContent | InvalidInput {
  const copied = copyJsonValue(input)
  if ('failed' in copied) return invalid()
  const judgment = judgeModelProfileDocument('ModelProfileContent', copied.ok)
  if ('rejected' in judgment) return invalid(judgment.rejected)
  if (!isContent(copied.ok)) throw new Error('content validator disagrees')
  return copied.ok
}
export function parseRef(input: unknown): ModelProfileRef | InvalidInput {
  const copied = copyJsonValue(input)
  if ('failed' in copied) return invalid()
  const judgment = judgeModelProfileDocument('ModelProfileRef', copied.ok)
  if ('rejected' in judgment) return invalid(judgment.rejected)
  if (!isRef(copied.ok)) throw new Error('reference validator disagrees')
  return copied.ok
}
export function positiveOrdinal(input: unknown): input is OfficialManifest['ordinal'] {
  return (
    isNonNegativeJsonInteger(input) &&
    !/^[-]?0(?:\.0*)?(?:[eE][+-]?\d+)?$/u.test(jsonNumberSource(input))
  )
}
export function parseManifest(input: unknown): OfficialManifest | InvalidInput {
  const copied = copyJsonValue(input)
  if ('failed' in copied || !object(copied.ok)) return invalid()
  const value = copied.ok
  if (
    Object.keys(value).length !== 2 ||
    !positiveOrdinal(value.ordinal) ||
    !Array.isArray(value.entries)
  )
    return invalid()
  const entries: ModelProfileContent[] = []
  for (const raw of value.entries) {
    const entry = parseContent(raw)
    if ('failure' in entry) return entry
    if (entry.origin !== 'official') return invalid()
    entries.push(entry)
  }
  if (new Set(entries.map(e => e.routeName)).size !== entries.length) return invalid()
  return { ordinal: value.ordinal, entries }
}
const replaceKeys = [
  'providers',
  'allowFallback',
  'parameters',
  'adaptation',
  'inputModalities',
  'outputModalities',
  'maxInputTokens',
  'maxOutputTokens',
  'inputConstraints',
  'upstreamInputLimits',
]
function isPatch(input: unknown): input is ProfilePatch {
  if (!object(input) || Object.keys(input).some(k => k !== 'replace' && k !== 'remove'))
    return false
  const replace = input.replace
  const remove = input.remove
  if (
    replace !== undefined &&
    (!object(replace) || Object.keys(replace).some(k => !replaceKeys.includes(k)))
  )
    return false
  if (
    remove !== undefined &&
    (!Array.isArray(remove) || remove.length !== 1 || remove[0] !== 'parameters')
  )
    return false
  if (
    object(replace) &&
    Object.hasOwn(replace, 'adaptation') &&
    !validate('ModelAdaptationBinding', replace.adaptation).valid
  )
    return false
  return (object(replace) && Object.keys(replace).length > 0) || remove !== undefined
}
export function parsePatch(input: unknown): ProfilePatch | InvalidInput {
  const copied = copyJsonValue(input)
  return 'ok' in copied && isPatch(copied.ok) ? copied.ok : invalid()
}
export function jsonObject(
  value: JsonValue,
): value is import('@omne-harness-lite/content-blocks').JsonObject {
  return object(value)
}
