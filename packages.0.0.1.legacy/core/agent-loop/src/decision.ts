import { copyJsonValue, isJsonNumber, type JsonObject } from '@omne-harness-lite/content-blocks'
import {
  checkKey,
  checkSourceToken,
  positiveInteger,
  sourceTokenEquals,
} from '@omne-harness-lite/session-log'
import type {
  Continuation,
  CurrentInputs,
  InvalidInput,
  LoopDecision,
  LoopFacts,
  Unavailable,
} from './types.ts'
export const invalidInput: InvalidInput = Object.freeze({ invalidInput: true })
const unavailable: Unavailable = Object.freeze({ unavailable: true, reason: 'requiredSource' })
const positions = [
  'attempt_started',
  'before_persist_message',
  'after_persist_message',
  'before_compaction',
  'after_compaction',
  'before_model_call',
  'after_model_call',
  'before_action',
  'after_action',
  'before_terminal',
  'after_terminal',
]
function object(value: unknown): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
function fields(value: JsonObject, names: readonly string[]): boolean {
  return (
    Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name))
  )
}
function terminal(value: unknown): boolean {
  return typeof value === 'string' && ['completed', 'failed', 'cancelled'].includes(value)
}
const continuationFields: Readonly<Record<Continuation['kind'], readonly string[]>> = {
  adoptInputs: ['kind', 'originalPosition', 'positions'],
  invokeModel: ['kind', 'originalPosition', 'preparation'],
  executeActions: ['kind', 'originalPosition', 'batch'],
  compact: ['kind', 'originalPosition', 'plan'],
  runExtensions: ['kind', 'originalPosition', 'position', 'subject'],
  finish: ['kind', 'originalPosition', 'terminal', 'reason'],
  wait: ['kind', 'originalPosition', 'originalCalls'],
}
function inputPositions(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(positiveInteger)
}
function callKeys(value: unknown): boolean {
  return Array.isArray(value) && value.every(checkKey) && new Set(value).size === value.length
}
function continuationBody(value: JsonObject): boolean {
  switch (value.kind) {
    case 'adoptInputs':
      return inputPositions(value.positions)
    case 'wait':
      return callKeys(value.originalCalls)
    case 'finish':
      return terminal(value.terminal) && checkKey(value.reason)
    case 'runExtensions':
      return typeof value.position === 'string' && positions.includes(value.position)
    default:
      return true
  }
}
export function checkContinuation(value: unknown): value is Continuation {
  if (!object(value) || typeof value.kind !== 'string') return false
  if (!Object.hasOwn(continuationFields, value.kind) || !checkKey(value.originalPosition))
    return false
  const names = continuationFields[value.kind as Continuation['kind']]
  return fields(value, names) && continuationBody(value)
}
function runState(value: JsonObject): boolean {
  if (value.attempt !== null && !positiveInteger(value.attempt)) return false
  if (value.terminal !== null && !terminal(value.terminal)) return false
  if (value.continuation !== null && !checkContinuation(value.continuation)) return false
  if (value.attempt === null || value.terminal !== null) return value.continuation === null
  return value.continuation !== null
}
function checkedRun(value: unknown): value is LoopFacts['run'] {
  if (value === null) return true
  if (!object(value) || !fields(value, ['id', 'attempt', 'terminal', 'continuation'])) return false
  return checkKey(value.id) && runState(value)
}
function nullableBoolean(value: unknown): boolean {
  return value === null || typeof value === 'boolean'
}
function nullableKey(value: unknown): boolean {
  return value === null || checkKey(value)
}
function checkedCurrent(value: unknown): value is CurrentInputs {
  if (
    !object(value) ||
    !fields(value, ['source', 'authorized', 'assembly', 'contextGeneration', 'reconciled'])
  )
    return false
  if (value.source !== null && 'failure' in checkSourceToken(value.source)) return false
  return (
    nullableBoolean(value.authorized) &&
    nullableBoolean(value.reconciled) &&
    nullableKey(value.assembly) &&
    nullableKey(value.contextGeneration)
  )
}
function completeFacts(value: unknown): value is LoopFacts {
  return object(value) && fields(value, ['source', 'run']) && checkedRun(value.run)
}
function capture(
  input: unknown,
):
  | { readonly input: { readonly facts: LoopFacts; readonly currentInputs: CurrentInputs } }
  | InvalidInput
  | Unavailable {
  const copy = copyJsonValue(input)
  if ('failed' in copy || !object(copy.ok)) return invalidInput
  const value = copy.ok
  if (!fields(value, ['facts', 'currentInputs'])) return invalidInput
  if (value.facts === null || value.currentInputs === null) return unavailable
  if (!completeFacts(value.facts) || !checkedCurrent(value.currentInputs)) return invalidInput
  const checked = checkSourceToken(value.facts.source)
  if ('failure' in checked) return invalidInput
  return {
    input: {
      facts: { source: checked.ok, run: value.facts.run },
      currentInputs: value.currentInputs,
    },
  }
}
function runDecision(facts: LoopFacts): LoopDecision | InvalidInput {
  const { source, run } = facts
  if (run === null || run.attempt === null || run.terminal !== null)
    return { kind: 'idle', reason: 'noRunnableAttempt', expectedSourceToken: source }
  if (run.continuation === null) return invalidInput
  return Object.freeze({
    ...run.continuation,
    expectedSourceToken: source,
    run: run.id,
    attempt: run.attempt,
  })
}
export function nextStep(input: {
  readonly facts: LoopFacts
  readonly currentInputs: CurrentInputs
}): LoopDecision | InvalidInput | Unavailable {
  const captured = capture(input)
  if (!('input' in captured)) return captured
  const { facts, currentInputs: current } = captured.input,
    source = facts.source
  if (Object.values(current).includes(null)) return unavailable
  if (!sourceTokenEquals(source, current.source!))
    return { kind: 'blocked', reason: 'refreshFacts', expectedSourceToken: source }
  if (!current.authorized) return { kind: 'blocked', reason: 'denied', expectedSourceToken: source }
  if (!current.reconciled)
    return { kind: 'blocked', reason: 'reconcile', expectedSourceToken: source }
  return runDecision(facts)
}
export function checkDecision(value: unknown): value is Extract<LoopDecision, { run: string }> {
  const copied = copyJsonValue(value)
  if ('failed' in copied || !object(copied.ok)) return false
  const { expectedSourceToken, run, attempt, ...continuation } = copied.ok
  return (
    !('failure' in checkSourceToken(expectedSourceToken)) &&
    checkKey(run) &&
    positiveInteger(attempt) &&
    checkContinuation(continuation)
  )
}
