import { copyJsonValue, type JsonObject, type JsonNumber } from '@omne-harness-lite/content-blocks'
import type { RunId, AttemptId } from '@omne-harness-lite/call-accounts'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { compareRfc3339Instants } from '@omne-harness-lite/offer-expiry'
import {
  checkKey,
  positiveInteger,
  compareInteger,
  checkLogPayload,
  factLogPayload,
  type FactLogPayload,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import type { CreateSessionInput, OperationRef, AttemptStartedFact, Terminal } from './types.ts'
import { checkOperationRef } from './operation.ts'
import { checkAttemptStarted, SESSION_FACT_OWNER, SESSION_FACT_VERSION } from './facts.ts'

export type SessionFact =
  | AttemptStartedFact
  | {
      readonly kind: 'session_created'
      readonly operation: OperationRef
      readonly definition: CreateSessionInput['definition']
      readonly executionType: string
      readonly mode: CreateSessionInput['mode']
      readonly collaboration: CreateSessionInput['collaboration']
      readonly workspace: string | null
      readonly at: string
    }
  | {
      readonly kind: 'input_accepted'
      readonly operation: OperationRef
      readonly semanticDigest: string
      readonly messagePosition: JsonNumber
      readonly at: string
    }
  | {
      readonly kind: 'run_started'
      readonly run: RunId
      readonly inputPosition: JsonNumber
      readonly stepKey: string
      readonly at: string
    }
  | {
      readonly kind: 'input_adopted'
      readonly run: RunId
      readonly attempt: AttemptId
      readonly inputPosition: JsonNumber
      readonly stepKey: string
      readonly at: string
    }
  | {
      readonly kind: 'call_prepared'
      readonly run: RunId
      readonly attempt: AttemptId
      readonly call: string
      readonly originalPosition: string
      readonly stepKey: string
      readonly at: string
    }
  | {
      readonly kind: 'result_custodied'
      readonly run: RunId
      readonly attempt: AttemptId
      readonly call: string
      readonly resultKey: string
      readonly semanticDigest: string
      readonly at: string
    }
  | {
      readonly kind: 'run_finished'
      readonly run: RunId
      readonly attempt: AttemptId
      readonly terminal: Terminal
      readonly reason: string
      readonly stepKey: string
      readonly at: string
    }
export type SessionFactCheck =
  { readonly kind: 'fact'; readonly fact: SessionFact } | { readonly failure: 'invalidInput' }
const invalid = Object.freeze({ failure: 'invalidInput' } as const)
const fields = {
  session_created: [
    'kind',
    'operation',
    'definition',
    'executionType',
    'mode',
    'collaboration',
    'workspace',
    'at',
  ],
  input_accepted: ['kind', 'operation', 'semanticDigest', 'messagePosition', 'at'],
  run_started: ['kind', 'run', 'inputPosition', 'stepKey', 'at'],
  input_adopted: ['kind', 'run', 'attempt', 'inputPosition', 'stepKey', 'at'],
  call_prepared: ['kind', 'run', 'attempt', 'call', 'originalPosition', 'stepKey', 'at'],
  result_custodied: ['kind', 'run', 'attempt', 'call', 'resultKey', 'semanticDigest', 'at'],
  run_finished: ['kind', 'run', 'attempt', 'terminal', 'reason', 'stepKey', 'at'],
} as const
export function checkSessionFact(value: unknown): SessionFactCheck {
  const copied = copyJsonValue(value)
  if ('failed' in copied || !object(copied.ok)) return invalid
  const fact = copied.ok
  if (fact.kind === 'attempt_started') return checkAttemptStarted(fact)
  if (!lifecycleMetadataValid(fact)) return invalid
  return variantValid(fact) ? { kind: 'fact', fact: fact as unknown as SessionFact } : invalid
}
function lifecycleMetadataValid(fact: JsonObject): boolean {
  if (typeof fact.kind !== 'string' || !Object.hasOwn(fields, fact.kind)) return false
  const expected = fields[fact.kind as keyof typeof fields] as readonly string[]
  if (
    Object.keys(fact).length !== expected.length ||
    !expected.every(key => Object.hasOwn(fact, key))
  )
    return false
  if (typeof fact.at !== 'string' || !('ok' in compareRfc3339Instants(fact.at, fact.at)))
    return false
  return true
}
function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function variantValid(fact: JsonObject): boolean {
  switch (fact.kind) {
    case 'session_created':
      return creationValid(fact)
    case 'input_accepted':
      return acceptedInputValid(fact)
    case 'run_started':
      return runValid(fact) && positiveInteger(fact.inputPosition)
    case 'input_adopted':
      return adoptedInputValid(fact)
    case 'call_prepared':
      return preparedCallValid(fact)
    case 'run_finished':
      return finishedValid(fact)
    case 'result_custodied':
      return custodiedResultValid(fact)
    default:
      return false
  }
}
function custodiedResultValid(fact: JsonObject): boolean {
  return (
    checkKey(fact.run) &&
    positiveInteger(fact.attempt) &&
    checkKey(fact.call) &&
    checkKey(fact.resultKey) &&
    typeof fact.semanticDigest === 'string' &&
    /^[0-9a-f]{64}$/.test(fact.semanticDigest)
  )
}
function preparedCallValid(fact: JsonObject): boolean {
  return (
    runValid(fact) &&
    positiveInteger(fact.attempt) &&
    checkKey(fact.call) &&
    checkKey(fact.originalPosition)
  )
}
function adoptedInputValid(fact: JsonObject): boolean {
  return runValid(fact) && positiveInteger(fact.attempt) && positiveInteger(fact.inputPosition)
}
function acceptedInputValid(fact: JsonObject): boolean {
  return (
    operationValid(fact.operation, 'submitInput') &&
    checkKey(fact.semanticDigest) &&
    positiveInteger(fact.messagePosition)
  )
}
function operationValid(value: unknown, kind: OperationRef['operation']): boolean {
  const parsed = checkOperationRef(value)
  return 'operation' in parsed && parsed.operation.operation === kind
}
function creationValid(fact: JsonObject): boolean {
  return (
    operationValid(fact.operation, 'createSession') &&
    definitionValid(fact.definition) &&
    checkKey(fact.executionType) &&
    creationModes(fact) &&
    (fact.workspace === null || typeof fact.workspace === 'string')
  )
}
function creationModes(fact: JsonObject): boolean {
  return (
    typeof fact.mode === 'string' &&
    ['never', 'auto_permission', 'bypass-permissions'].includes(fact.mode) &&
    typeof fact.collaboration === 'string' &&
    ['co-work', 'auto-drive'].includes(fact.collaboration)
  )
}
function definitionValid(value: unknown): boolean {
  return (
    object(value) &&
    Object.keys(value).length === 2 &&
    value.category === 'agent_definition' &&
    checkKey(value.name)
  )
}
function runValid(fact: JsonObject): boolean {
  return checkKey(fact.run) && checkKey(fact.stepKey)
}
function finishedValid(fact: JsonObject): boolean {
  return (
    runValid(fact) &&
    positiveInteger(fact.attempt) &&
    typeof fact.terminal === 'string' &&
    ['completed', 'failed', 'cancelled'].includes(fact.terminal) &&
    checkKey(fact.reason)
  )
}
export function sessionFactPayload(value: SessionFact): FactLogPayload {
  const parsed = checkSessionFact(value)
  if ('failure' in parsed) throw new TypeError('invalid session fact')
  return factLogPayload(SESSION_FACT_OWNER, SESSION_FACT_VERSION, parsed.fact)
}
export function readSessionFact(entry: LogEntry): SessionFactCheck | { readonly kind: 'other' } {
  const payload = checkLogPayload(entry.payload)
  if ('failure' in payload) return invalid
  if (payload.kind !== 'fact' || payload.payload.owner !== SESSION_FACT_OWNER)
    return { kind: 'other' }
  if (payload.payload.version !== SESSION_FACT_VERSION) return invalid
  const parsed = checkSessionFact(payload.payload.value)
  if ('failure' in parsed || !entryMatches(entry, parsed.fact)) return invalid
  return parsed
}
function entryMatches(entry: LogEntry, fact: SessionFact): boolean {
  if ('operation' in fact) return operationEntryMatches(entry, fact)
  if (fact.kind === 'run_started') return startingEntryMatches(entry, fact)
  return attemptEntryMatches(entry, fact)
}
function operationEntryMatches(
  entry: LogEntry,
  fact: Extract<SessionFact, { operation: OperationRef }>,
): boolean {
  if (
    entry.run !== undefined ||
    entry.attempt !== undefined ||
    !tenantIdEquals(entry.tenant, fact.operation.tenant)
  )
    return false
  if (fact.kind === 'input_accepted')
    return (
      entry.session === fact.operation.session &&
      compareInteger(fact.messagePosition, entry.position) < 0
    )
  return true
}
function startingEntryMatches(
  entry: LogEntry,
  fact: Extract<SessionFact, { kind: 'run_started' }>,
): boolean {
  return (
    entry.run === undefined &&
    entry.attempt === undefined &&
    compareInteger(fact.inputPosition, entry.position) < 0
  )
}
function attemptEntryMatches(
  entry: LogEntry,
  fact: Extract<SessionFact, { attempt: AttemptId }>,
): boolean {
  if (entry.run !== fact.run) return false
  if (entry.attempt === undefined || compareInteger(entry.attempt, fact.attempt) !== 0) return false
  return fact.kind !== 'input_adopted' || compareInteger(fact.inputPosition, entry.position) < 0
}

/** Project attempt starts from the validated, closed Session fact union. */
export function readAttemptStarted(
  entry: LogEntry,
):
  | { readonly kind: 'fact'; readonly fact: AttemptStartedFact }
  | { readonly kind: 'other' }
  | { readonly failure: 'invalidInput' } {
  const parsed = readSessionFact(entry)
  if ('failure' in parsed || parsed.kind === 'other') return parsed
  return parsed.fact.kind === 'attempt_started'
    ? { kind: 'fact', fact: parsed.fact }
    : { kind: 'other' }
}
