import {
  copyJsonValue,
  isJsonNumber,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import type { SessionDriverPolicy } from './driver-types.ts'

const fields = [
  'scanLimit',
  'intervalMs',
  'maxTasks',
  'maxHeld',
  'maxFailures',
  'maxStepsPerPass',
] as const

function validBound(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 2147483647
  )
}

function policyObject(value: JsonValue): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}

/** Capture the exact engineering policy before allocating driver resources. */
export function checkSessionDriverPolicy(
  input: unknown,
): { readonly policy: SessionDriverPolicy } | { readonly invalidInput: true } {
  const copied = copyJsonValue(input)
  if ('failed' in copied || !policyObject(copied.ok)) return { invalidInput: true }
  const value = copied.ok
  if (Object.keys(value).length !== fields.length) return { invalidInput: true }
  const policy = {} as Record<(typeof fields)[number], number>
  for (const field of fields) {
    const candidate = value[field]
    if (!validBound(candidate)) return { invalidInput: true }
    policy[field] = candidate
  }
  return { policy: Object.freeze(policy) }
}
