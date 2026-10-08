import { compareRfc3339Instants } from '@omne-harness-lite/offer-expiry'
import { copyJsonValue, type JsonObject } from '@omne-harness-lite/content-blocks'
import {
  checkKey,
  checkLogPayload,
  compareInteger,
  factLogPayload,
  positiveInteger,
  type FactLogPayload,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import type { AttemptStartedFact } from './types.ts'

export const SESSION_FACT_OWNER = 'session-runtime'
export const SESSION_FACT_VERSION = '1'
const invalidInput = Object.freeze({ failure: 'invalidInput' } as const)
export function checkAttemptStarted(
  value: unknown,
): { readonly kind: 'fact'; readonly fact: AttemptStartedFact } | typeof invalidInput {
  const copy = copyJsonValue(value)
  if ('failed' in copy || typeof copy.ok !== 'object' || copy.ok === null || Array.isArray(copy.ok))
    return invalidInput
  const fact = copy.ok as JsonObject
  const keys = ['kind', 'run', 'attempt', 'reason', 'at']
  if (!closedFact(fact, keys)) return invalidInput
  if (fact.kind !== 'attempt_started' || !checkKey(fact.run) || !positiveInteger(fact.attempt))
    return invalidInput
  if (!startDetails(fact)) return invalidInput
  return { kind: 'fact', fact: copy.ok as unknown as AttemptStartedFact }
}
function startDetails(fact: JsonObject): boolean {
  return (
    typeof fact.reason === 'string' &&
    ['first', 'resumed_after_interruption', 'resumed_after_wait'].includes(fact.reason) &&
    typeof fact.at === 'string' &&
    'ok' in compareRfc3339Instants(fact.at, fact.at)
  )
}
export function attemptStartedPayload(value: AttemptStartedFact): FactLogPayload {
  const checked = checkAttemptStarted(value)
  if ('failure' in checked) throw new TypeError('invalid attempt start fact')
  return factLogPayload(SESSION_FACT_OWNER, SESSION_FACT_VERSION, checked.fact)
}
export function readAttemptStarted(
  entry: LogEntry,
):
  | { readonly kind: 'fact'; readonly fact: AttemptStartedFact }
  | { readonly kind: 'other' }
  | typeof invalidInput {
  const payload = checkLogPayload(entry.payload)
  if ('failure' in payload) return invalidInput
  if (payload.kind !== 'fact' || payload.payload.owner !== SESSION_FACT_OWNER)
    return { kind: 'other' }
  if (payload.payload.version !== SESSION_FACT_VERSION) return invalidInput
  const checked = checkAttemptStarted(payload.payload.value)
  if ('failure' in checked) return invalidInput
  if (
    entry.run !== checked.fact.run ||
    entry.attempt === undefined ||
    compareInteger(entry.attempt, checked.fact.attempt) !== 0
  )
    return invalidInput
  return checked
}

function closedFact(fact: JsonObject, keys: readonly string[]): boolean {
  return (
    Object.keys(fact).length === keys.length && Object.keys(fact).every(key => keys.includes(key))
  )
}
