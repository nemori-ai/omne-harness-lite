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
function localRelations(value: ToolJournalPayload): boolean {
  const { ref } = value
  if (
    !('ok' in parseTenantId(ref.tenant)) ||
    !journalIdentity(ref.session) ||
    !contentValid('CallId', ref.callId).valid
  )
    return false
  switch (value.kind) {
    case 'execution_intended': {
      if (
        !journalIdentity(value.origin.run) ||
        !positiveInteger(value.origin.attempt) ||
        !journalIdentity(value.origin.assistantMessage)
      )
        return false
      const selected = value.selected
      if (selected === undefined) return true
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
    case 'execution_started':
      return instant(value.at)
    case 'execution_context_read': {
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
    case 'resource_planned':
      return journalIdentity(value.resource.key) && journalIdentity(value.resource.provider)
    case 'resource_permitted':
      return journalIdentity(value.key)
    case 'physical_stop_observed':
      return journalIdentity(value.key) && instant(value.at)
    // The invocation's caller-owned judge checks support. A journal decoder does not compile author schemas.
    case 'execution_waiting':
      return (
        journalObject(value.request.answerSchema) &&
        (value.request.deadline === undefined || instant(value.request.deadline)) &&
        (value.request.cardId === undefined || journalIdentity(value.request.cardId))
      )
    case 'execution_answered':
      return journalIdentity(value.by.principal)
    case 'delivery_ready':
      return (
        resultValid(value.result, ref.callId) &&
        (value.basis.kind === 'conclusions'
          ? value.basis.keys.every(journalIdentity)
          : journalIdentity(value.basis.pass))
      )
    case 'delivery_confirmed': {
      const judged = judgeMessage(value.message)
      if (!('ok' in judged)) return false
      const message = judged.ok
      return message.type === 'tool'
        ? message.callId === ref.callId && resultValid(message.blocks[0], ref.callId)
        : message.type === 'system_reminder' &&
            (message.source.kind === 'background_execution_finished' ||
              message.source.kind === 'background_execution_interrupted') &&
            message.source.callId === ref.callId
    }
    case 'execution_ended': {
      const { terminal, account, delivery } = value
      if (
        !('ok' in judgeAccountValue('ToolCallAccount', account)) ||
        account.callId !== ref.callId ||
        !tenantIdEquals(account.initiator, ref.tenant) ||
        !resultValid(delivery.result, ref.callId) ||
        terminal.outcome !== delivery.result.outcome ||
        !journalIdentity(delivery.pass)
      )
        return false
      if ('result' in terminal && !('ok' in judgeToolReturn(terminal.result))) return false
      if (
        terminal.outcome === 'completed' &&
        typeof terminal.result !== 'string' &&
        terminal.result.isError === true
      )
        return false
      if (
        terminal.outcome === 'failed' &&
        terminal.code === 'business_failure' &&
        (typeof terminal.result !== 'object' || terminal.result?.isError !== true)
      )
        return false
      if (delivery.raw !== undefined && !contentValid('AttachmentRef', delivery.raw).valid)
        return false
      if (delivery.internal !== undefined) {
        const judged = judgeMessage(delivery.internal)
        if (
          !('ok' in judged) ||
          judged.ok.type !== 'tool_internal' ||
          judged.ok.callId !== ref.callId
        )
          return false
      }
      return true
    }
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
