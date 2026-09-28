import { ExactDecimal, judgeAccountValue } from '@omne-harness-lite/call-accounts'
import {
  validate as contentShape,
  copyJsonValue,
  isJsonNumber,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import {
  judgeModelProfileDocument,
  type ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import { validate as toolShape } from '@omne-harness-lite/tool-definition'
import type { OpenCallInput, ServiceInvalidInput } from './service-types.ts'
import type { EffectiveModel } from './selection-types.ts'

function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function basis(value: unknown): value is EffectiveModel {
  if (!object(value) || Object.keys(value).length !== 4) return false
  return (
    typeof value.routeName === 'string' &&
    'ok' in
      judgeModelProfileDocument('ModelProfileRef', {
        origin: 'official',
        routeName: value.routeName,
      }) &&
    'ok' in judgeModelProfileDocument('ModelProfileRef', value.profile) &&
    object(value.profile) &&
    value.profile.routeName === value.routeName &&
    (value.selectedBy === 'session' || value.selectedBy === 'layer_lock') &&
    typeof value.selected === 'string' &&
    'ok' in
      judgeModelProfileDocument('ModelProfileRef', {
        origin: 'official',
        routeName: value.selected,
      })
  )
}

/** Capture request-owned JSON before any asynchronous directory, registry or lease read.
 * The host is a capability port and is checked against the authoritative bind separately. */
export function ownOpenCallInput(
  input: OpenCallInput,
): { readonly request: OpenCallInput } | ServiceInvalidInput {
  if (
    input === null ||
    typeof input !== 'object' ||
    !('ok' in parseOpaqueIdentifier(input.session, 'SessionRef')) ||
    (input.callId !== undefined && !('ok' in judgeAccountValue('ModelCallId', input.callId))) ||
    !(
      'ok' in
      judgeModelProfileDocument('ModelProfileRef', {
        origin: 'official',
        routeName: input.target,
      })
    ) ||
    (input.targetChangedBy !== undefined &&
      !contentShape('CapabilityId', input.targetChangedBy).valid) ||
    input.host === null ||
    typeof input.host !== 'object' ||
    !Array.isArray(input.messages) ||
    !Array.isArray(input.tools)
  )
    return { invalidInput: { reason: 'malformed' } }
  if (input.targetChangedBy === undefined && input.target !== input.basis?.routeName)
    return { invalidInput: { reason: 'malformed' } }
  if (
    (input.run === undefined) !== (input.attempt === undefined) ||
    (input.run === undefined) !== (input.report === undefined) ||
    (input.run !== undefined && !('ok' in judgeAccountValue('RunId', input.run))) ||
    (input.attempt !== undefined && !('ok' in judgeAccountValue('AttemptId', input.attempt)))
  )
    return { invalidInput: { reason: 'malformed' } }
  const clonedBasis = copyJsonValue(input.basis)
  if (!('ok' in clonedBasis) || !basis(clonedBasis.ok))
    return { invalidInput: { reason: 'malformed' } }
  const clonedParameters =
    input.parameters === undefined ? undefined : copyJsonValue(input.parameters)
  if (
    clonedParameters !== undefined &&
    (!('ok' in clonedParameters) ||
      !('ok' in judgeModelProfileDocument('ModelRequestParameters', clonedParameters.ok)))
  )
    return { invalidInput: { reason: 'malformed' } }
  const parameters =
    clonedParameters === undefined
      ? undefined
      : // The owned copy was checked against ModelRequestParameters immediately above.
        (clonedParameters.ok as ModelRequestParameters)
  const clonedReport = input.report === undefined ? undefined : copyJsonValue(input.report)
  if (clonedReport !== undefined && !('ok' in clonedReport))
    return { invalidInput: { reason: 'malformed' } }
  if (input.run !== undefined) {
    const report = clonedReport?.ok
    if (
      !object(report) ||
      report.session !== input.session ||
      report.runId !== input.run ||
      !isJsonNumber(report.attempt) ||
      !('ok' in judgeAccountValue('AttemptId', report.attempt)) ||
      input.attempt === undefined ||
      ExactDecimal.from(report.attempt).compare(ExactDecimal.from(input.attempt)) !== 0
    )
      return { invalidInput: { reason: 'malformed' } }
  }
  const messages: OpenCallInput['messages'][number][] = []
  const calls = new Map<string, number>()
  const results = new Map<string, number>()
  for (const item of input.messages) {
    const judged = judgeMessage(item)
    if ('rejected' in judged || judged.ok.type === 'tool_internal')
      return { invalidInput: { reason: 'malformed' } }
    messages.push(judged.ok)
    if (judged.ok.type === 'assistant')
      for (const block of judged.ok.blocks)
        if (block.kind === 'tool_call' && block.complete)
          calls.set(block.callId, (calls.get(block.callId) ?? 0) + 1)
    if (judged.ok.type === 'tool')
      results.set(judged.ok.callId, (results.get(judged.ok.callId) ?? 0) + 1)
  }
  if (
    [...calls].some(([id, count]) => count !== 1 || results.get(id) !== 1) ||
    [...results].some(([id, count]) => count !== 1 || calls.get(id) !== 1)
  )
    return { invalidInput: { reason: 'malformed' } }
  const tools: OpenCallInput['tools'][number][] = []
  for (const item of input.tools) {
    if (!toolShape('ModelToolName', item).valid || tools.includes(item))
      return { invalidInput: { reason: 'malformed' } }
    tools.push(item)
  }
  const common = {
    session: input.session,
    ...(input.callId === undefined ? {} : { callId: input.callId }),
    target: input.target,
    ...(input.targetChangedBy === undefined ? {} : { targetChangedBy: input.targetChangedBy }),
    basis: clonedBasis.ok,
    ...(parameters === undefined ? {} : { parameters }),
    messages: Object.freeze(messages),
    tools: Object.freeze(tools),
    host: input.host,
  }
  const request: OpenCallInput =
    input.run === undefined
      ? Object.freeze(common)
      : Object.freeze({
          ...common,
          run: input.run,
          attempt: input.attempt,
          report: clonedReport?.ok,
        })
  return { request }
}
