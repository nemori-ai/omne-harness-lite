import { createParameterJudge, type ParameterJudge } from '@omne-harness-lite/tool-definition'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { StorageUnavailable, type AtomicStorage } from '@omne-harness-lite/storage'
import type { LogAuthority, SessionLogParticipant, LogEntry } from '@omne-harness-lite/session-log'
import {
  inspectToolJournalEntry,
  projectToolJournal,
  toolJournalCallKey,
  type ExecutionRef,
  type ToolExecutionRecords,
} from '@omne-harness-lite/tool-execution-runtime'
import { jsonObject } from './json-values.ts'

function captureRef(input: unknown): ExecutionRef | undefined {
  const copy = copyJsonValue(input)
  if ('failed' in copy || !jsonObject(copy.ok) || Object.keys(copy.ok).length !== 3) return
  const tenant = parseTenantId(copy.ok.tenant),
    session = parseOpaqueIdentifier(copy.ok.session, 'SessionRef'),
    call = parseOpaqueIdentifier(copy.ok.callId, 'CallId')
  if ('ok' in tenant && 'ok' in session && 'ok' in call)
    return { tenant: tenant.ok, session: session.ok, callId: call.ok }
}

export function createToolExecutionRecordReader(input: {
  readonly parameters?: ParameterJudge

  readonly storage: AtomicStorage
  readonly tenant: TenantId
  readonly participant: Pick<SessionLogParticipant, 'sourceIn' | 'readByKeyIn'>
  readonly authority: LogAuthority
}): Pick<ToolExecutionRecords, 'readOriginalIn'> {
  const ownedTenant = parseTenantId(input.tenant)
  if (!('ok' in ownedTenant)) throw new TypeError('invalid Tool record tenant')
  const { storage, participant, authority } = input
  const parameters = input.parameters ?? createParameterJudge()
  return Object.freeze({
    async readOriginalIn(unit, requested) {
      const ref = captureRef(requested)
      if (!ref || !tenantIdEquals(ref.tenant, ownedTenant.ok)) return { kind: 'invalidSource' }
      unit.assertStorage(storage)
      const key = toolJournalCallKey(ref.callId)
      if (typeof key !== 'string') return { kind: 'invalidSource' }
      try {
        const scope = { tenant: ref.tenant, session: ref.session }
        const source = await participant.sourceIn(unit, authority, scope)
        if ('failure' in source) return { kind: 'unavailable' }
        const records = await participant.readByKeyIn(unit, authority, source.source, key)
        if ('failure' in records) return { kind: 'unavailable' }
        return historyOf(ref, records.entries, parameters)
      } catch (error) {
        if (error instanceof StorageUnavailable) return { kind: 'unavailable' }
        throw error
      }
    },
  })
}

function historyOf(
  ref: ExecutionRef,
  entries: readonly LogEntry[],
  parameters: ParameterJudge,
): Awaited<ReturnType<ToolExecutionRecords['readOriginalIn']>> {
  const scope = { tenant: ref.tenant, session: ref.session }
  for (const entry of entries) {
    const checked = inspectToolJournalEntry(scope, entry, parameters)
    if (!('value' in checked) || checked.value.ref.callId !== ref.callId)
      return { kind: 'invalidSource' }
  }
  const projected = projectToolJournal(scope, entries, parameters)
  if ('invalid' in projected) return { kind: 'invalidSource' }
  const history = projected.executions.get(ref.callId)
  return history ? { kind: 'found', history } : { kind: 'absent' }
}
