import { copyJsonValue, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import { isToolDefinition } from '@omne-harness-lite/tool-definition'
import { checkKey, checkSourceToken } from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { PreparedToolExecution, SelectedTool } from '@omne-harness-lite/tool-execution-runtime'
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
const required = ['access', 'ref', 'origin', 'call', 'args', 'selected', 'source', 'afterAction']

function ordinary(input: PreparedToolExecution) {
  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) return
  const fields = Object.getOwnPropertyDescriptors(input)
  if (required.some(key => !Object.hasOwn(fields, key))) return
  if (
    Reflect.ownKeys(fields).some(
      key => typeof key !== 'string' || ![...required, 'admissionToken'].includes(key),
    )
  )
    return
  if (Object.values(fields).some(field => !('value' in field) || !field.enumerable)) return
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

function requestData(
  data: JsonObject,
  access: PreparedToolExecution['access'],
  selected: SelectedTool,
) {
  if (!jsonObject(data.ref) || Object.keys(data.ref).length !== 3) return invalid
  const request = captureSubmission({
    access,
    scope: { tenant: data.ref.tenant, session: data.ref.session },
    origin: data.origin,
    call: data.call,
    adoption: selected.adoption,
    ...(data.admissionToken === undefined ? {} : { admissionToken: data.admissionToken }),
  })
  if ('reason' in request) return request
  if (request.call.callId !== data.ref.callId || !sameJson(request.call.arguments, data.args))
    return invalid
  return request
}

/** Capture the prepared values once. Only the original Access object stays live. */
export function capturePreparedExecution(input: PreparedToolExecution) {
  if (input === null || typeof input !== 'object') return invalid
  const captured = ordinary(input)
  if (!captured) return invalid
  const { value, access } = captured
  const selected = selectedTool(value.selected),
    chain = afterAction(value.afterAction)
  if (!selected || !chain) return invalid
  const request = requestData(value, access, selected)
  if ('reason' in request) return request
  const source = checkSourceToken(value.source)
  if ('failure' in source) return invalid
  if (
    source.ok.session !== request.scope.session ||
    !tenantIdEquals(source.ok.tenant, request.scope.tenant)
  )
    return invalid
  return { request, selected, source: source.ok, chain }
}

export async function verifyPreparedExecution(
  captured: Exclude<ReturnType<typeof capturePreparedExecution>, SubmissionFailure>,
  currentAdmission: () => ToolAdmissionOperations | undefined,
): Promise<SubmissionFailure | undefined> {
  const { request, source } = captured
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
