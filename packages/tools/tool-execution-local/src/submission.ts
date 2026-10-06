import { copyJsonValue, judgeContentBlock } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { compareInteger, positiveInteger } from '@omne-harness-lite/session-log'
import type { SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import type { ToolAdmissionOperations } from '@omne-harness-lite/tool-admission'
import type {
  ExecutionSubmission,
  SelectedTool,
  SubmissionResult,
  ToolJournalHistory,
} from '@omne-harness-lite/tool-execution-runtime'
import type { RuntimeJournalView } from './runtime-journal.ts'
import { jsonObject, sameJson } from './json-values.ts'

export type SubmissionFailure = Extract<SubmissionResult, { kind: 'rejected' }>
const reject = (reason: SubmissionFailure['reason']): SubmissionFailure => ({
  kind: 'rejected',
  reason,
})

/** Access is an opaque live identity. Capture every ordinary value before the first await. */
export function captureSubmission(
  input: ExecutionSubmission,
): ExecutionSubmission | SubmissionFailure {
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
  const copied = copyJsonValue(ordinary)
  if ('failed' in copied || !jsonObject(copied.ok)) return reject('invalidInput')
  const value = copied.ok
  if (
    !jsonObject(value.scope) ||
    Object.keys(value.scope).length !== 2 ||
    !jsonObject(value.origin) ||
    Object.keys(value.origin).length !== 3 ||
    !('ok' in parseTenantId(value.scope.tenant)) ||
    !('ok' in parseOpaqueIdentifier(value.scope.session, 'SessionRef')) ||
    !('ok' in parseOpaqueIdentifier(value.origin.run, 'RunId')) ||
    !('ok' in parseOpaqueIdentifier(value.origin.assistantMessage, 'AssistantMessageId')) ||
    !positiveInteger(value.origin.attempt) ||
    !('ok' in parseOpaqueIdentifier(value.adoption, 'AdoptionId')) ||
    (Object.hasOwn(value, 'admissionToken') && typeof value.admissionToken !== 'string')
  )
    return reject('invalidInput')
  const call = judgeContentBlock(value.call)
  if (!('ok' in call) || call.ok.kind !== 'tool_call' || call.ok.complete !== true)
    return reject('invalidInput')
  return { ...(value as unknown as Omit<ExecutionSubmission, 'access'>), access, call: call.ok }
}

/** Provider-owned durable input. Live access and admission locators are not execution identity. */
export function submissionIdentity(request: ExecutionSubmission) {
  return { origin: request.origin, adoption: request.adoption, call: request.call }
}

export type SubmissionAdmission =
  | SubmissionFailure
  | {
      readonly kind: 'existing'
      readonly request: ExecutionSubmission
      readonly view: RuntimeJournalView
      readonly execution: ToolJournalHistory
    }
  | {
      readonly kind: 'admitted'
      readonly request: ExecutionSubmission
      readonly view: RuntimeJournalView
      readonly selected?: SelectedTool
      readonly notExecutable?: 'unparseable' | 'no_such_entry'
    }

/** The caller must append against this exact view. Tail conflict requires a new check, including token verification. */
export function createSubmissionAdmission(input: {
  readonly authorization: SessionAccessOperations
  readonly journal: {
    readonly read: (
      scope: ExecutionSubmission['scope'],
      call: string,
    ) => Promise<RuntimeJournalView | { readonly kind: 'rejected'; readonly reason: string }>
  }
  readonly admission: () => ToolAdmissionOperations | undefined
  readonly isOpen: () => boolean
  readonly attempts: number
}) {
  if (!Number.isSafeInteger(input.attempts) || input.attempts < 1)
    throw new TypeError('positive submission check attempts required')
  async function authorize(request: ExecutionSubmission): Promise<SubmissionFailure | undefined> {
    if (!input.isOpen()) return reject('ownerStopped')
    const result = await input.authorization.authorize(request.access, request.scope, 'tool.submit')
    if (!input.isOpen()) return reject('ownerStopped')
    if (result.kind === 'authorized') return
    return reject(result.reason === 'unavailable' ? 'runtimeUnavailable' : result.reason)
  }
  function facts(request: ExecutionSubmission, view: RuntimeJournalView): SubmissionAdmission {
    const history = view.facts
    if (!history) return reject('originUnavailable')
    if (!sameJson(history.origin, request.origin)) return reject('originUnavailable')
    if (history.adoption.key !== request.adoption) return reject('adoptionUnavailable')
    if (history.batch.kind !== 'complete') return reject('admissionMissing')
    const item = history.batch.completion.items.find(item => item.callId === request.call.callId)
    if (!item || !sameJson(item.effectiveCall, request.call)) return reject('callConflict')
    if (item.decision.kind === 'denied' || history.route.kind === 'denial')
      return reject('callConflict')
    if (history.route.kind === 'execution') {
      const execution = view.executions.get(request.call.callId)
      const stored = execution?.intent.value.input
      if (
        !execution ||
        !jsonObject(stored) ||
        stored.format !== 'tool-input/1' ||
        !sameJson(stored.submission, submissionIdentity(request))
      )
        return reject('callConflict')
      return { kind: 'existing', request, view, execution }
    }
    if (view.executions.has(request.call.callId)) return reject('callConflict')
    if (
      history.runState !== 'open' ||
      compareInteger(history.latestAttempt, request.origin.attempt) !== 0
    )
      return reject('runEnded')
    if (item.decision.kind === 'notExecutable')
      return { kind: 'admitted', request, view, notExecutable: item.decision.reason }
    const tool = history.adoption.tools.find(tool => tool.name === request.call.tool)
    if (!tool) return reject('adoptionUnavailable')
    return {
      kind: 'admitted',
      request,
      view,
      selected: {
        capability: tool.capability,
        asset: tool.asset,
        version: tool.version,
        definition: tool.definition,
        adoption: request.adoption,
      },
    }
  }
  return async (supplied: ExecutionSubmission): Promise<SubmissionAdmission> => {
    let request: ExecutionSubmission | SubmissionFailure
    try {
      request = captureSubmission(supplied)
    } catch {
      return reject('invalidInput')
    }
    if ('reason' in request) return request
    try {
      for (let attempt = 0; attempt < input.attempts; attempt++) {
        const before = await authorize(request)
        if (before) return before
        const view = await input.journal.read(request.scope, request.call.callId)
        if (view.kind !== 'view') return reject('runtimeUnavailable')
        const decision = facts(request, view)
        if (decision.kind === 'rejected') return decision
        if (decision.kind === 'existing' || decision.notExecutable !== undefined) {
          const after = await authorize(request)
          return after ?? decision
        }
        const admission = input.admission()
        if (!admission || request.admissionToken === undefined) return reject('admissionMissing')
        const verified = await admission.verifyToken(
          request.access,
          request.scope,
          request.admissionToken,
          request.call,
        )
        const after = await authorize(request)
        if (after) return after
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
        if (input.admission() !== admission) return reject('admissionMissing')
        if (
          !tenantIdEquals(verified.checked.scope.tenant, request.scope.tenant) ||
          verified.checked.scope.session !== request.scope.session ||
          verified.checked.ownerGeneration !== view.prefix.ownerGeneration
        )
          return reject('runtimeUnavailable')
        if (compareInteger(verified.checked.tail, view.prefix.tail) !== 0) continue
        return decision
      }
      return reject('runtimeUnavailable')
    } catch {
      return reject(input.isOpen() ? 'runtimeUnavailable' : 'ownerStopped')
    }
  }
}
