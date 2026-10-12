import { copyJsonValue, type JsonObject } from '@omne-harness-lite/content-blocks'
import { checkKey, checkSourceToken, compareInteger } from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { DriveResult, RunnableDecision } from './types.ts'
function calls(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  const seen = new Set<string>()
  for (const call of value) {
    if (!checkKey(call) || seen.has(call)) return false
    seen.add(call)
  }
  return true
}
function committed(result: JsonObject, decision: RunnableDecision): boolean {
  if (Object.keys(result).length !== 2) return false
  const source = checkSourceToken(result.source)
  if ('failure' in source) return false
  const expected = decision.expectedSourceToken
  return (
    source.ok.session === expected.session &&
    tenantIdEquals(source.ok.tenant, expected.tenant) &&
    source.ok.journalGeneration === expected.journalGeneration &&
    compareInteger(source.ok.tail, expected.tail) >= 0
  )
}
function blocked(result: JsonObject, decision: RunnableDecision): boolean {
  return (
    Object.keys(result).length === 3 &&
    result.obligation === decision.originalPosition &&
    ['unsupported', 'denied', 'unavailable', 'awaitCancelled', 'released'].includes(
      String(result.reason),
    )
  )
}
function waiting(result: JsonObject, decision: RunnableDecision): boolean {
  return (
    Object.keys(result).length === 3 &&
    result.originalPosition === decision.originalPosition &&
    calls(result.originalCalls)
  )
}
function shaped(result: JsonObject, decision: RunnableDecision): boolean {
  switch (result.kind) {
    case 'committed':
      return committed(result, decision)
    case 'retryFromFacts':
      return Object.keys(result).length === 1
    case 'waiting':
      return waiting(result, decision)
    case 'handedBack':
      return Object.keys(result).length === 2 && calls(result.originalCalls)
    case 'blocked':
      return blocked(result, decision)
    default:
      return result.invalidInput === true && Object.keys(result).length === 1
  }
}
export function captureDriveResult(
  input: unknown,
  decision: RunnableDecision,
): DriveResult | undefined {
  const copied = copyJsonValue(input)
  if (
    'failed' in copied ||
    copied.ok === null ||
    typeof copied.ok !== 'object' ||
    Array.isArray(copied.ok)
  )
    return
  if (!shaped(copied.ok as JsonObject, decision)) return
  return copied.ok as unknown as DriveResult
}
