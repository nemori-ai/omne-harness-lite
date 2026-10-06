import { createRequire } from 'node:module'
import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  isJsonNumber,
  judgeContentBlock,
  readJsonStrict,
  validate as contentValid,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import {
  captureEnvironmentAdoption,
  sameEnvironmentScope,
} from '@omne-harness-lite/execution-environments'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { positiveInteger } from '@omne-harness-lite/session-log'
import { judgeToolDefinition, judgeToolReturn } from '@omne-harness-lite/tool-definition'
import type { ToolJournalPayload } from './tool-journal.ts'

export const invalidJournal = Object.freeze({ invalid: true } as const)
const require = createRequire(new URL('../package.json', import.meta.url))
export function journalShape(name: 'Value' | 'Payload', value: JsonValue): boolean {
  const validators = require('./generated/tool-journal.cjs') as Record<
    'Value' | 'Payload',
    (value: unknown) => boolean
  >
  return validators[name](value)
}
export function journalObject(value: unknown): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
export function journalIdentity(value: unknown): value is string {
  return 'ok' in parseOpaqueIdentifier(value, 'ToolJournalIdentity')
}
function instant(value: string): boolean {
  return 'ok' in instantFromRfc3339(value.replace(/\.[0-9]+(?=Z|[+-])/u, ''))
}
function resultValid(value: unknown, callId: string): boolean {
  const judged = judgeContentBlock(value)
  return (
    'ok' in judged &&
    judged.ok.kind === 'tool_result' &&
    judged.ok.callId === callId &&
    judged.ok.outcome !== 'denied' &&
    judged.ok.outcome !== 'backgrounded'
  )
}
type RecordOf<K extends ToolJournalPayload['kind']> = Extract<ToolJournalPayload, { kind: K }>
function intentRelations(value: RecordOf<'execution_intended'>): boolean {
  if (
    !journalIdentity(value.origin.run) ||
    !positiveInteger(value.origin.attempt) ||
    !journalIdentity(value.origin.assistantMessage)
  )
    return false
  return value.selected === undefined || selectedRelations(value.selected)
}
function selectedRelations(
  selected: NonNullable<RecordOf<'execution_intended'>['selected']>,
): boolean {
  const version = readJsonStrict(selected.version)
  return (
    journalIdentity(selected.capability) &&
    journalIdentity(selected.asset) &&
    journalIdentity(selected.adoption) &&
    !('failed' in version) &&
    positiveInteger(version.ok) &&
    'ok' in judgeToolDefinition(selected.definition)
  )
}

function contextRelations(value: RecordOf<'execution_context_read'>): boolean {
  const keys = new Set<string>()
  return value.values.every(item => {
    if (
      !journalIdentity(item.key) ||
      !journalIdentity(item.revision) ||
      !instant(item.observedAt) ||
      keys.has(item.key)
    )
      return false
    keys.add(item.key)
    return true
  })
}
// The invocation's caller-owned judge checks support. This decoder does not compile author schemas.
function waitRelations(value: RecordOf<'execution_waiting'>): boolean {
  return (
    journalObject(value.request.answerSchema) &&
    (value.request.deadline === undefined || instant(value.request.deadline)) &&
    (value.request.cardId === undefined || journalIdentity(value.request.cardId))
  )
}
function runtimeRelations(
  value: RecordOf<
    | 'execution_started'
    | 'execution_context_read'
    | 'resource_planned'
    | 'resource_permitted'
    | 'physical_stop_observed'
    | 'execution_waiting'
    | 'execution_answered'
  >,
): boolean {
  switch (value.kind) {
    case 'execution_started':
      return instant(value.at)
    case 'execution_context_read':
      return contextRelations(value)
    case 'resource_planned':
      return journalIdentity(value.resource.key) && journalIdentity(value.resource.provider)
    case 'resource_permitted':
      return journalIdentity(value.key)
    case 'physical_stop_observed':
      return journalIdentity(value.key) && instant(value.at)
    case 'execution_waiting':
      return waitRelations(value)
    case 'execution_answered':
      return journalIdentity(value.by.principal)
  }
}
function confirmedRelations(value: RecordOf<'delivery_confirmed'>): boolean {
  const judged = judgeMessage(value.message)
  if (!('ok' in judged)) return false
  const message = judged.ok
  return message.type === 'tool'
    ? message.callId === value.ref.callId && resultValid(message.blocks[0], value.ref.callId)
    : message.type === 'system_reminder' &&
        (message.source.kind === 'background_execution_finished' ||
          message.source.kind === 'background_execution_interrupted') &&
        message.source.callId === value.ref.callId
}
function terminalResultRelations(terminal: RecordOf<'execution_ended'>['terminal']): boolean {
  if ('result' in terminal && !('ok' in judgeToolReturn(terminal.result))) return false
  switch (terminal.outcome) {
    case 'completed':
      return typeof terminal.result === 'string' || terminal.result.isError !== true
    case 'failed':
      return (
        terminal.code !== 'business_failure' ||
        (typeof terminal.result === 'object' && terminal.result?.isError === true)
      )
    default:
      return true
  }
}

function deliveryArtifactsRelations(
  delivery: RecordOf<'execution_ended'>['delivery'],
  callId: string,
): boolean {
  if (delivery.raw !== undefined && !contentValid('AttachmentRef', delivery.raw).valid) return false
  if (delivery.internal === undefined) return true
  const judged = judgeMessage(delivery.internal)
  return 'ok' in judged && judged.ok.type === 'tool_internal' && judged.ok.callId === callId
}
function endedRelations(value: RecordOf<'execution_ended'>): boolean {
  const { terminal, account, delivery, ref } = value
  return (
    'ok' in judgeAccountValue('ToolCallAccount', account) &&
    account.callId === ref.callId &&
    tenantIdEquals(account.initiator, ref.tenant) &&
    resultValid(delivery.result, ref.callId) &&
    terminal.outcome === delivery.result.outcome &&
    journalIdentity(delivery.pass) &&
    terminalResultRelations(terminal) &&
    deliveryArtifactsRelations(delivery, ref.callId)
  )
}
function adoptionRelations(value: RecordOf<'execution_environment_adopted'>): boolean {
  const adoption = captureEnvironmentAdoption(value.adoption)
  return (
    adoption !== undefined &&
    sameEnvironmentScope(adoption.placement.scope, value.ref) &&
    adoption.placement.execution === value.ref.callId
  )
}
function referenceRelations(ref: ToolJournalPayload['ref']): boolean {
  return (
    'ok' in parseTenantId(ref.tenant) &&
    journalIdentity(ref.session) &&
    contentValid('CallId', ref.callId).valid
  )
}
function readyRelations(value: RecordOf<'delivery_ready'>): boolean {
  return (
    resultValid(value.result, value.ref.callId) &&
    (value.basis.kind === 'conclusions'
      ? value.basis.keys.every(journalIdentity)
      : journalIdentity(value.basis.pass))
  )
}
function localRelations(value: ToolJournalPayload): boolean {
  const { ref } = value
  if (!referenceRelations(ref)) return false
  switch (value.kind) {
    case 'execution_intended':
      return intentRelations(value)
    case 'execution_environment_adopted':
      return adoptionRelations(value)
    case 'delivery_ready':
      return readyRelations(value)
    case 'delivery_confirmed':
      return confirmedRelations(value)
    case 'execution_ended':
      return endedRelations(value)
    default:
      return runtimeRelations(value)
  }
}

/** Checks the closed record and delegates nested contracts to their public owners. */
export function captureToolJournalValue(
  input: unknown,
): ToolJournalPayload | typeof invalidJournal {
  const copy = copyJsonValue(input)
  if ('failed' in copy || !journalShape('Value', copy.ok)) return invalidJournal
  const value = copy.ok as unknown as ToolJournalPayload
  return localRelations(value) ? value : invalidJournal
}
