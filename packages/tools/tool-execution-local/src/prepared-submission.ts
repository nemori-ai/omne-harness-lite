import { copyJsonValue, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import { isToolDefinition } from '@omne-harness-lite/tool-definition'
import { checkKey, checkSourceToken } from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  PreparedToolExecution,
  SelectedTool,
  ExecutionSubmission,
} from '@omne-harness-lite/tool-execution-runtime'
import type { ToolAdmissionOperations } from '@omne-harness-lite/tool-admission'
import { compareInteger } from '@omne-harness-lite/session-log'
import {
  captureSubmission,
  classifyAdmissionVerification,
  submissionIdentity,
  type SubmissionFailure,
} from './submission.ts'
import { jsonObject, sameJson } from './json-values.ts'

const invalid: SubmissionFailure = Object.freeze({ kind: 'rejected', reason: 'invalidInput' })
const common = ['access', 'ref', 'origin', 'call', 'source', 'afterAction']

function preparedProperties(input: PreparedToolExecution) {
  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) return
  const fields = Object.getOwnPropertyDescriptors(input)
  const required = [
    ...common,
    ...(Object.hasOwn(fields, 'notExecutable')
      ? ['adoption', 'notExecutable']
      : ['args', 'selected']),
  ]
  if (required.some(key => !Object.hasOwn(fields, key))) return
  if (
    Reflect.ownKeys(fields).some(
      key => typeof key !== 'string' || ![...required, 'admissionToken'].includes(key),
    )
  )
    return
  if (Object.values(fields).some(field => !('value' in field) || !field.enumerable)) return
  return fields
}
function ordinary(input: PreparedToolExecution) {
  const fields = preparedProperties(input)
  if (!fields) return
  const copied = copyJsonValue(
    Object.fromEntries(
      Object.entries(fields)
        .filter(([key]) => key !== 'access')
        .map(([key, field]) => [key, field.value]),
    ),
  )
  if ('failed' in copied || !jsonObject(copied.ok)) return
  return { access: fields.access!.value as PreparedToolExecution['access'], value: copied.ok }
}

function selectedTool(value: JsonValue | undefined): SelectedTool | undefined {
  if (!jsonObject(value) || Object.keys(value).length !== 5) return
  const { capability, asset, version, adoption, definition } = value
  if (!nonempty(capability) || !nonempty(asset) || !nonempty(version) || !nonempty(adoption)) return
  if (!isToolDefinition(definition)) return
  return { capability, asset, version, adoption, definition }
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function afterAction(value: JsonValue | undefined) {
  if (!jsonObject(value) || Object.keys(value).length !== 2) return
  if (!checkKey(value.pass) || !Array.isArray(value.selectedChain)) return
  return { pass: value.pass, chain: value.selectedChain }
}

function requestData(data: JsonObject, access: PreparedToolExecution['access'], adoption: string) {
  if (!jsonObject(data.ref) || Object.keys(data.ref).length !== 3) return invalid
  const request = captureSubmission({
    access,
    scope: { tenant: data.ref.tenant, session: data.ref.session },
    origin: data.origin,
    call: data.call,
    adoption,
    ...(data.admissionToken === undefined ? {} : { admissionToken: data.admissionToken }),
  })
  if ('reason' in request) return request
  if (request.call.callId !== data.ref.callId) return invalid
  return request
}

function disposition(value: JsonObject) {
  if (Object.hasOwn(value, 'notExecutable')) {
    if (
      !['unparseable', 'no_such_entry'].includes(String(value.notExecutable)) ||
      !checkKey(value.adoption)
    )
      return
    return {
      adoption: value.adoption,
      notExecutable: value.notExecutable as 'unparseable' | 'no_such_entry',
    }
  }
  const selected = selectedTool(value.selected)
  return selected ? { adoption: selected.adoption, selected } : undefined
}
function matchesCall(
  value: JsonObject,
  request: Exclude<ReturnType<typeof captureSubmission>, SubmissionFailure>,
  decision: NonNullable<ReturnType<typeof disposition>>,
) {
  if ('notExecutable' in decision)
    return (decision.notExecutable === 'unparseable') === (request.call.unparseable === true)
  return request.call.unparseable !== true && sameJson(request.call.arguments, value.args)
}
function preparedSource(value: JsonValue | undefined, request: ExecutionSubmission) {
  const source = checkSourceToken(value)
  if ('failure' in source) return
  if (
    source.ok.session !== request.scope.session ||
    !tenantIdEquals(source.ok.tenant, request.scope.tenant)
  )
    return
  return source.ok
}
/** Capture the prepared values once. Only the original Access object stays live. */
export function capturePreparedExecution(input: PreparedToolExecution) {
  if (input === null || typeof input !== 'object') return invalid
  const captured = ordinary(input)
  if (!captured) return invalid
  const { value, access } = captured
  const decision = disposition(value),
    chain = afterAction(value.afterAction)
  if (!decision || !chain) return invalid
  const request = requestData(value, access, decision.adoption)
  if ('reason' in request) return request
  if (!matchesCall(value, request, decision)) return invalid
  const source = preparedSource(value.source, request)
  if (!source) return invalid
  return { request, ...decision, source, chain }
}

export async function verifyPreparedExecution(
  captured: Exclude<ReturnType<typeof capturePreparedExecution>, SubmissionFailure>,
  currentAdmission: () => ToolAdmissionOperations | undefined,
): Promise<SubmissionFailure | undefined> {
  const { request, source } = captured
  if ('notExecutable' in captured) return
  const admission = currentAdmission()
  if (!admission || request.admissionToken === undefined)
    return { kind: 'rejected', reason: 'admissionMissing' }
  const result = classifyAdmissionVerification(
    await admission.verifyToken(
      request.access,
      request.scope,
      request.admissionToken,
      request.call,
    ),
  )
  if (result.kind === 'rejected') return result
  if (currentAdmission() !== admission) return { kind: 'rejected', reason: 'admissionMissing' }
  const checked = result.verified.checked
  if (
    checked.scope.session !== source.session ||
    !tenantIdEquals(checked.scope.tenant, source.tenant) ||
    compareInteger(checked.tail, source.tail) !== 0
  )
    return { kind: 'rejected', reason: 'runtimeUnavailable' }
}

export function samePreparedExecution(
  saved: Exclude<ReturnType<typeof capturePreparedExecution>, SubmissionFailure> | undefined,
  current: Exclude<ReturnType<typeof capturePreparedExecution>, SubmissionFailure>,
) {
  return (
    saved !== undefined &&
    sameJson(
      { ...saved, request: submissionIdentity(saved.request) },
      { ...current, request: submissionIdentity(current.request) },
    )
  )
}
