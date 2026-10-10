import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  readJsonStrict,
  writeJsonLossless,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import { checkOperationRef, type SessionStateChange } from '@omne-harness-lite/session-runtime'
import { checkSourceToken, positiveInteger, checkKey } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { StatePolicy } from './state-types.ts'

export class InvalidStateInput extends Error {
  constructor() {
    super('invalid local session state input')
  }
}
export function statePolicy(value: StatePolicy): StatePolicy {
  for (const field of [value.maxPendingPerSession, value.maxBatchSize, value.maxRecordBytes]) {
    if (!Number.isSafeInteger(field) || field <= 0 || field >= Number.MAX_SAFE_INTEGER)
      throw new InvalidStateInput()
  }
  return Object.freeze({ ...value })
}
export function stateScope(value: unknown): SessionScope {
  const copy = copyJsonValue(value)
  if (
    'failed' in copy ||
    typeof copy.ok !== 'object' ||
    copy.ok === null ||
    Array.isArray(copy.ok) ||
    Object.keys(copy.ok).length !== 2
  )
    throw new InvalidStateInput()
  const source = checkSourceToken({ ...copy.ok, journalGeneration: 'scope', tail: 0 })
  if ('failure' in source) throw new InvalidStateInput()
  return Object.freeze({ tenant: Object.freeze(source.ok.tenant), session: source.ok.session })
}
export function positionText(value: unknown, limit: number): string {
  const copy = copyJsonValue(value)
  if ('failed' in copy || !positiveInteger(copy.ok)) throw new InvalidStateInput()
  const decimal = ExactDecimal.from(copy.ok).toCanonicalString()
  const match = /^(\d+)e(-?\d+)$/.exec(decimal)
  if (!match) throw new InvalidStateInput()
  const coefficient = match[1]!,
    exponent = BigInt(match[2]!)
  if (exponent < 0n || exponent + BigInt(coefficient.length) > BigInt(limit))
    throw new InvalidStateInput()
  return coefficient + '0'.repeat(Number(exponent))
}
export function positionNumber(value: string): JsonNumber {
  const result = readJsonStrict(value)
  if ('failed' in result || !positiveInteger(result.ok)) throw new InvalidStateInput()
  return result.ok
}
const fields: Record<SessionStateChange['kind'], readonly string[]> = {
  initialize: ['kind', 'stepKey'],
  acceptInput: ['kind', 'operation', 'semanticDigest', 'position'],
  startRun: ['kind', 'stepKey', 'run', 'position'],
  startAttempt: ['kind', 'stepKey', 'run', 'attempt', 'executionGeneration', 'reason'],
  adoptInput: ['kind', 'stepKey', 'run', 'attempt', 'position', 'permit'],
  finish: ['kind', 'stepKey', 'run', 'attempt', 'terminal', 'permit'],
}
export function stateChange(value: SessionStateChange, policy: StatePolicy): SessionStateChange {
  const { serializable, permit } = separatePermit(value)
  const copied = copyJsonValue(serializable)
  if ('failed' in copied || Buffer.byteLength(writeJsonLossless(copied.ok)) > policy.maxRecordBytes)
    throw new InvalidStateInput()
  const owned = copied.ok as Record<string, unknown>
  if (typeof owned.kind !== 'string' || !Object.hasOwn(fields, owned.kind))
    throw new InvalidStateInput()
  const expected = fields[owned.kind as SessionStateChange['kind']]
  const complete = { ...owned, ...(permit ? { permit: permit.value } : {}) }
  if (
    Object.keys(complete).length !== expected.length ||
    !expected.every(key => Object.hasOwn(complete, key))
  )
    throw new InvalidStateInput()
  checkChangeFields(owned, policy)
  return Object.freeze(complete) as unknown as SessionStateChange
}
export function separatePermit(value: unknown): {
  serializable: object
  permit: PropertyDescriptor | undefined
} {
  if (typeof value !== 'object' || value === null) throw new InvalidStateInput()
  const descriptors: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(value)
  const permit = descriptors.permit
  if (permit && (!('value' in permit) || !permit.enumerable)) throw new InvalidStateInput()
  delete descriptors.permit
  return { serializable: Object.create(Object.getPrototypeOf(value), descriptors), permit }
}
function checkChangeFields(value: Record<string, unknown>, policy: StatePolicy): void {
  if ('stepKey' in value && !checkKey(value.stepKey)) throw new InvalidStateInput()
  if ('run' in value && !checkKey(value.run)) throw new InvalidStateInput()
  if ('position' in value) positionText(value.position, policy.maxRecordBytes)
  if ('attempt' in value) positionText(value.attempt, policy.maxRecordBytes)
  checkVariant(value)
}
function checkVariant(value: Record<string, unknown>): void {
  if (value.kind === 'acceptInput') {
    if ('failure' in checkOperationRef(value.operation) || !checkKey(value.semanticDigest))
      throw new InvalidStateInput()
  } else if (value.kind === 'startAttempt') {
    if (!attemptFieldsValid(value)) throw new InvalidStateInput()
  } else if (
    value.kind === 'finish' &&
    (typeof value.terminal !== 'string' ||
      !['completed', 'failed', 'cancelled'].includes(value.terminal))
  )
    throw new InvalidStateInput()
}
function attemptFieldsValid(value: Record<string, unknown>): boolean {
  return (
    checkKey(value.executionGeneration) &&
    typeof value.reason === 'string' &&
    ['first', 'resumed_after_interruption', 'resumed_after_wait'].includes(value.reason)
  )
}
