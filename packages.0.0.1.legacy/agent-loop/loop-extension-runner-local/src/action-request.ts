import { readReport } from '@omne-harness-lite/asset-registry'
import { ExactDecimal, judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { copyJsonValue, judgeContentBlock } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { judgePositionedSubject, validate } from '@omne-harness-lite/loop-extension'
import type { BeforeActionSubject } from '@omne-harness-lite/loop-extension'
import type {
  RunnerActionRequest,
  RunnerActionSource,
  RunnerLogBinding,
} from '@omne-harness-lite/loop-extension-runner'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'

const invalidInput = Object.freeze({ failure: 'invalidInput' } as const)
const unavailable = Object.freeze({ failure: 'unavailable' } as const)
/** Route by an own data member without invoking a caller accessor. Validation follows separately. */
export function isActionDispatch(value: unknown): boolean {
  try {
    return (
      value !== null &&
      typeof value === 'object' &&
      Object.getOwnPropertyDescriptor(value, 'position')?.value === 'before_action'
    )
  } catch {
    return false
  }
}
function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== null && prototype !== Object.prototype) return false
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return (
    Reflect.ownKeys(value).length === Object.keys(value).length &&
    Object.values(descriptors).every(item => 'value' in item && item.enumerable)
  )
}
function exact(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  return (
    required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key))
  )
}
function identity(value: unknown): value is string {
  return 'ok' in parseOpaqueIdentifier(value, 'ActionIdentity')
}
const modes = ['never', 'auto_permission', 'bypass-permissions']

/** Own request data before host IO. The grants object retains its opaque identity. */
export function captureActionRequest(
  supplied: unknown,
): { readonly request: RunnerActionRequest } | typeof invalidInput {
  try {
    if (
      !record(supplied) ||
      !exact(supplied, [
        'position',
        'actions',
        'anchors',
        'assistantMessage',
        'manifest',
        'run',
        'attempt',
        'admission',
      ]) ||
      supplied.position !== 'before_action' ||
      !record(supplied.admission) ||
      !exact(supplied.admission, ['report', 'grants', 'runMode'], ['parent'])
    )
      return invalidInput
    const { grants, ...admissionData } = supplied.admission
    if (!grants || typeof grants !== 'object' || Array.isArray(grants)) return invalidInput
    const copied = copyJsonValue({ ...supplied, admission: admissionData })
    if ('failed' in copied) return invalidInput
    const value = copied.ok as unknown as Omit<RunnerActionRequest, 'admission'> & {
      readonly admission: Omit<RunnerActionRequest['admission'], 'grants'>
    }
    if (
      !identity(value.manifest) ||
      !identity(value.assistantMessage) ||
      !('ok' in judgeAccountValue('RunId', value.run)) ||
      !('ok' in judgeAccountValue('AttemptId', value.attempt)) ||
      !Array.isArray(value.actions) ||
      !Array.isArray(value.anchors) ||
      value.anchors.length !== value.actions.length ||
      !value.anchors.every(identity) ||
      new Set(value.anchors).size !== value.anchors.length ||
      !modes.includes(value.admission.runMode)
    )
      return invalidInput
    const parent = value.admission.parent
    if (
      parent !== undefined &&
      (!record(parent) ||
        !exact(parent, ['permission', 'runMode']) ||
        !['forbid', 'ask', 'auto'].includes(parent.permission) ||
        !modes.includes(parent.runMode))
    )
      return invalidInput
    const report = readReport(value.admission.report, value.manifest)
    if (
      !report ||
      report.runId !== value.run ||
      ExactDecimal.from(report.attempt).compare(ExactDecimal.from(value.attempt)) !== 0
    )
      return invalidInput
    const actions: BeforeActionSubject[] = []
    for (const action of value.actions) {
      const judged = judgePositionedSubject({ position: 'before_action', subject: action })
      if ('rejected' in judged || judged.ok.position !== 'before_action') return invalidInput
      const subject = judged.ok.subject
      if (
        subject.call.complete !== true ||
        subject.call.unparseable === true ||
        subject.definition.name !== subject.call.tool ||
        !subject.batch.includes(subject.call.callId)
      )
        return invalidInput
      if (actions.length > 0 && !modelLogJsonEqual(actions[0]!.batch, subject.batch))
        return invalidInput
      actions.push(subject)
    }
    if (new Set(actions.map(item => item.call.callId)).size !== actions.length) return invalidInput
    return {
      request: Object.freeze({
        ...value,
        actions: Object.freeze(actions),
        admission: Object.freeze({ ...value.admission, report, grants }),
      }) as RunnerActionRequest,
    }
  } catch {
    return invalidInput
  }
}

/** Compare against host facts, including unparseable calls absent from actions. */
export function checkActionSource(
  request: RunnerActionRequest,
  supplied: RunnerActionSource | undefined,
  binding: RunnerLogBinding,
): { readonly source: RunnerActionSource } | typeof invalidInput | typeof unavailable {
  try {
    if (!supplied) return unavailable
    const { access, grants, ...data } = supplied
    const copied = copyJsonValue(data)
    if ('failed' in copied) return unavailable
    const value = copied.ok as unknown as Omit<RunnerActionSource, 'access' | 'grants'>
    const scope = value.scope
    if (
      !scope ||
      !grants ||
      typeof grants !== 'object' ||
      Array.isArray(grants) ||
      !modes.includes(value.runMode) ||
      !('ok' in parseTenantId(scope.tenant)) ||
      !identity(scope.session) ||
      scope.session !== binding.session ||
      !tenantIdEquals(scope.tenant, binding.tenant) ||
      !Array.isArray(value.calls) ||
      value.calls.length === 0 ||
      !Array.isArray(value.anchors) ||
      !value.anchors.every(identity) ||
      new Set(value.anchors).size !== value.anchors.length ||
      !Array.isArray(value.toolNames) ||
      !value.toolNames.every(name => validate('ToolDefinitionRef', { name }).valid) ||
      new Set(value.toolNames).size !== value.toolNames.length
    )
      return unavailable
    const report = readReport(value.report, scope.session)
    if (
      !report ||
      report.runId !== value.run ||
      ExactDecimal.from(report.attempt).compare(ExactDecimal.from(value.attempt)) !== 0 ||
      !modelLogJsonEqual(
        Object.keys(report.effectivePermissions).sort(),
        [...value.toolNames].sort(),
      )
    )
      return unavailable
    for (const call of value.calls) {
      const judged = judgeContentBlock(call)
      if (!('ok' in judged) || judged.ok.kind !== 'tool_call' || judged.ok.complete !== true)
        return unavailable
    }
    const calls = value.calls
    if (new Set(calls.map(call => call.callId)).size !== calls.length) return unavailable
    if (
      request.manifest !== scope.session ||
      request.run !== value.run ||
      !modelLogJsonEqual(request.attempt, value.attempt) ||
      request.admission.grants !== grants ||
      request.admission.runMode !== value.runMode ||
      !modelLogJsonEqual(request.admission.parent ?? null, value.parent ?? null) ||
      request.assistantMessage !== value.assistantMessage ||
      !modelLogJsonEqual(request.admission.report, report)
    )
      return invalidInput
    const parsed = calls.filter(call => call.unparseable !== true)
    if (parsed.length !== value.anchors.length) return unavailable
    if (
      parsed.length !== request.actions.length ||
      !modelLogJsonEqual(request.anchors, value.anchors) ||
      request.actions.some(
        (action, index) =>
          !modelLogJsonEqual(action.call, parsed[index]) ||
          !modelLogJsonEqual(
            action.batch,
            calls.map(call => call.callId),
          ),
      )
    )
      return invalidInput
    return { source: Object.freeze({ ...value, report, access, grants }) }
  } catch {
    return unavailable
  }
}
