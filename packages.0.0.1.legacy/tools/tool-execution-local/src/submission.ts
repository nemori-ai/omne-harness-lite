import {
  copyJsonValue,
  judgeContentBlock,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { positiveInteger } from '@omne-harness-lite/session-log'
import type { ToolAdmissionOperations } from '@omne-harness-lite/tool-admission'
import type {
  ExecutionSubmission,
  SubmissionResult,
} from '@omne-harness-lite/tool-execution-runtime'
import { jsonObject } from './json-values.ts'

export type SubmissionFailure = Extract<SubmissionResult, { kind: 'rejected' }>
const reject = (reason: SubmissionFailure['reason']): SubmissionFailure => ({
  kind: 'rejected',
  reason,
})

function captureSubmissionProperties(input: unknown) {
  if (input === null || typeof input !== 'object') return reject('invalidInput')
  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) return reject('invalidInput')
  const fields = Object.getOwnPropertyDescriptors(input)
  const required = ['access', 'scope', 'origin', 'adoption', 'call']
  if (
    Reflect.ownKeys(fields).some(
      key => typeof key !== 'string' || ![...required, 'admissionToken'].includes(key),
    ) ||
    required.some(key => !Object.hasOwn(fields, key)) ||
    Object.values(fields).some(field => !('value' in field) || !field.enumerable)
  )
    return reject('invalidInput')
  const access = fields.access!.value as ExecutionSubmission['access']
  const ordinary = Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => key !== 'access')
      .map(([key, field]) => [key, field.value]),
  )
  return { access, ordinary }
}

function captureSubmissionData(ordinary: unknown) {
  const copied = copyJsonValue(ordinary)
  if ('failed' in copied || !jsonObject(copied.ok)) return reject('invalidInput')
  const value = copied.ok
  if (
    !jsonObject(value.scope) ||
    Object.keys(value.scope).length !== 2 ||
    !jsonObject(value.origin) ||
    Object.keys(value.origin).length !== 3
  )
    return reject('invalidInput')
  return { value, scope: value.scope, origin: value.origin }
}

function checkSubmissionCoordinates(
  value: JsonObject,
  scope: JsonObject,
  origin: JsonObject,
): SubmissionFailure | undefined {
  if (
    !('ok' in parseTenantId(scope.tenant)) ||
    !('ok' in parseOpaqueIdentifier(scope.session, 'SessionRef')) ||
    !('ok' in parseOpaqueIdentifier(origin.run, 'RunId')) ||
    !('ok' in parseOpaqueIdentifier(origin.assistantMessage, 'AssistantMessageId')) ||
    !positiveInteger(origin.attempt) ||
    !('ok' in parseOpaqueIdentifier(value.adoption, 'AdoptionId')) ||
    (Object.hasOwn(value, 'admissionToken') && typeof value.admissionToken !== 'string')
  )
    return reject('invalidInput')
}

/** Access is an opaque live identity. Capture every ordinary value before the first await. */
export function captureSubmission(input: unknown): ExecutionSubmission | SubmissionFailure {
  const properties = captureSubmissionProperties(input)
  if ('reason' in properties) return properties
  const captured = captureSubmissionData(properties.ordinary)
  if ('reason' in captured) return captured
  const { value, scope, origin } = captured
  const invalid = checkSubmissionCoordinates(value, scope, origin)
  if (invalid) return invalid
  const call = judgeContentBlock(value.call)
  if (!('ok' in call) || call.ok.kind !== 'tool_call' || call.ok.complete !== true)
    return reject('invalidInput')
  return {
    ...(value as unknown as Omit<ExecutionSubmission, 'access'>),
    access: properties.access,
    call: call.ok,
  }
}

/** Provider-owned durable input. Live access and admission locators are not execution identity. */
export function submissionIdentity(request: ExecutionSubmission) {
  return { origin: request.origin, adoption: request.adoption, call: request.call }
}

type AdmissionVerification = Awaited<ReturnType<ToolAdmissionOperations['verifyToken']>>
type VerifiedAdmission = Extract<AdmissionVerification, { kind: 'valid' }>

export function classifyAdmissionVerification(
  verified: AdmissionVerification,
): SubmissionFailure | { readonly kind: 'valid'; readonly verified: VerifiedAdmission } {
  if (verified.kind === 'failed')
    return reject(verified.reason === 'unavailable' ? 'runtimeUnavailable' : verified.reason)
  if (verified.kind === 'invalid')
    return reject(
      verified.reason === 'run_ended'
        ? 'runEnded'
        : verified.reason === 'not_admitted'
          ? 'admissionMissing'
          : 'callConflict',
    )
  return { kind: 'valid', verified }
}
