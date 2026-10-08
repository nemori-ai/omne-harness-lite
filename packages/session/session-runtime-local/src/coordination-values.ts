import {
  copyJsonValue,
  isJsonNumber,
  writeJsonLossless,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import {
  checkKey,
  checkSourceToken,
  compareInteger,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { StepCommit } from '@omne-harness-lite/session-runtime'
import type { SessionLifecycleStep } from './runtime-types.ts'
import { InvalidStateInput, positionText, stateScope, separatePermit } from './state-values.ts'
import { runtimeSemantic } from './runtime-values.ts'

export class CoordinationRejection extends Error {
  constructor(readonly failure: Extract<StepCommit, { failure: string }>['failure']) {
    super(`local Session coordination: ${failure}`)
  }
}
const fields = {
  startRun: ['kind', 'stepKey', 'inputPosition'],
  startAttempt: ['kind', 'stepKey', 'run', 'reason'],
  adoptInput: ['kind', 'stepKey', 'run', 'attempt', 'inputPosition', 'permit'],
  finish: ['kind', 'stepKey', 'run', 'attempt', 'terminal', 'reason', 'permit'],
}
export function lifecycleInput(
  scope: SessionScope,
  source: SourceToken,
  step: SessionLifecycleStep,
  limit: number,
) {
  const ownedScope = stateScope(scope),
    checked = checkSourceToken(source)
  if ('failure' in checked) throw new InvalidStateInput()
  if (
    !tenantIdEquals(ownedScope.tenant, checked.ok.tenant) ||
    ownedScope.session !== checked.ok.session
  )
    throw new CoordinationRejection('retryFromFacts')
  const { data, complete } = stepData(step)
  checkStepFields(data, limit)
  if (
    'inputPosition' in data &&
    compareInteger(data.inputPosition as JsonNumber, checked.ok.tail) > 0
  )
    throw new CoordinationRejection('retryFromFacts')
  return {
    scope: ownedScope,
    source: checked.ok,
    step: Object.freeze(complete) as unknown as SessionLifecycleStep,
    semantic: runtimeSemantic(data, limit),
  }
}
function stepData(step: SessionLifecycleStep) {
  const { serializable, permit } = separatePermit(step)
  const data = copiedStepData(serializable)
  if (typeof data.kind !== 'string' || !Object.hasOwn(fields, data.kind))
    throw new InvalidStateInput()
  const expected = fields[data.kind as keyof typeof fields]
  const complete = { ...data, ...(permit ? { permit: permit.value } : {}) }
  if (
    Object.keys(complete).length !== expected.length ||
    !expected.every(k => Object.hasOwn(complete, k))
  )
    throw new InvalidStateInput()
  return { data, complete }
}
function copiedStepData(value: unknown): Record<string, unknown> {
  const copy = copyJsonValue(value)
  if (
    'failed' in copy ||
    !copy.ok ||
    typeof copy.ok !== 'object' ||
    Array.isArray(copy.ok) ||
    isJsonNumber(copy.ok)
  )
    throw new InvalidStateInput()
  return copy.ok as Record<string, unknown>
}
function checkStepFields(data: Record<string, unknown>, limit: number) {
  if (!checkKey(data.stepKey)) throw new InvalidStateInput()
  if ('run' in data && !checkKey(data.run)) throw new InvalidStateInput()
  if ('inputPosition' in data) positionText(data.inputPosition, limit)
  if ('attempt' in data) positionText(data.attempt, limit)
  checkReason(data)
}
function checkReason(data: Record<string, unknown>) {
  if (
    data.kind === 'startAttempt' &&
    !['first', 'resumed_after_interruption', 'resumed_after_wait'].includes(String(data.reason))
  )
    throw new InvalidStateInput()
  if (
    data.kind === 'finish' &&
    (!['completed', 'failed', 'cancelled'].includes(String(data.terminal)) ||
      !checkKey(data.reason))
  )
    throw new InvalidStateInput()
}

export function usableSource(current: SourceToken, expected: SourceToken) {
  if (
    current.journalGeneration !== expected.journalGeneration ||
    compareInteger(expected.tail, current.tail) > 0
  )
    throw new CoordinationRejection('retryFromFacts')
}
export function boundedText(value: unknown, limit: number) {
  const copied = copyJsonValue(value)
  if ('failed' in copied) throw new InvalidStateInput()
  const text = writeJsonLossless(copied.ok)
  if (Buffer.byteLength(text) > limit) throw new CoordinationRejection('unavailable')
  return text
}
