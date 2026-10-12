import type { ParameterJudge } from '@omne-harness-lite/tool-definition'
import {
  inspectToolJournalEntry,
  type ToolOriginalIssueIdentity,
} from '@omne-harness-lite/tool-execution-runtime'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  addInteger,
  checkAppendInput,
  checkSourceToken,
  compareInteger,
  type JsonNumber,
  type SessionLogParticipant,
} from '@omne-harness-lite/session-log'
import type { StorageUnit } from '@omne-harness-lite/storage'
import type { runtimeAuthority } from './runtime-authority.ts'
import type { RuntimeOptions } from './runtime-types.ts'

type Input = {
  readonly options: RuntimeOptions
  readonly authority: ReturnType<typeof runtimeAuthority>
  readonly log: SessionLogParticipant
  readonly activeIn: (unit: StorageUnit) => ToolOriginalIssueIdentity | undefined
  readonly original: (
    unit: StorageUnit,
    ref: ToolOriginalIssueIdentity['ref'],
  ) => Promise<ToolOriginalIssueIdentity | undefined>
}

export function createToolRecordAppender(input: Input): SessionLogParticipant['appendIn'] {
  return async (unit, access, request, suppliedSource) => {
    unit.assertStorage(input.options.storage)
    if (access !== input.authority.logAccess || !request.entries.length)
      return { failure: 'denied' }
    const captured = captureAppend(request, suppliedSource)
    if ('failure' in captured) return captured
    request = captured.request
    suppliedSource = captured.source
    const active = input.activeIn(unit)
    const first = inspectToolJournalEntry(
      { tenant: input.options.tenant, session: request.session },
      { ...request.entries[0]!, session: request.session, position: 1 },
      input.options.parameters,
    )
    if (!('value' in first)) return { failure: 'denied' }
    const original = active ?? (await input.original(unit, first.value.ref))
    if (!original || !tenantIdEquals(original.ref.tenant, input.options.tenant))
      return { failure: 'denied' }
    const scope = { tenant: original.ref.tenant, session: original.ref.session }
    if (!matchingRecords(request, original, active !== undefined, input.options.parameters))
      return { failure: 'denied' }
    const append = () => input.log.appendIn(unit, access, request, suppliedSource)
    if (active) return append()
    return input.authority.withinRun(unit, scope, original.origin.run, append)
  }
}

function captureAppend(
  request: Parameters<SessionLogParticipant['appendIn']>[2],
  source: Parameters<SessionLogParticipant['appendIn']>[3],
) {
  const batch = checkAppendInput(request.session, request.entries, request.fence, request.condition)
  if ('failure' in batch) return batch
  if (source === undefined) return { request: batch.ok, source: undefined }
  const fixed = checkSourceToken(source)
  return 'failure' in fixed ? fixed : { request: batch.ok, source: fixed.ok }
}

function matchingRecords(
  request: Parameters<SessionLogParticipant['appendIn']>[2],
  original: ToolOriginalIssueIdentity,
  active: boolean,
  parameters?: ParameterJudge,
): boolean {
  if (request.session !== original.ref.session) return false
  const scope = { tenant: original.ref.tenant, session: original.ref.session }
  let position: JsonNumber = 0
  return request.entries.every(entry => {
    const checked = inspectToolJournalEntry(
      scope,
      {
        ...entry,
        session: request.session,
        position: (position = addInteger(position, 1)),
      },
      parameters,
    )
    if (!('value' in checked) || checked.value.ref.callId !== original.ref.callId) return false
    if (
      entry.run !== original.origin.run ||
      entry.attempt === undefined ||
      compareInteger(entry.attempt, original.origin.attempt) !== 0
    )
      return false
    if (checked.value.kind === 'delivery_confirmed') return false
    return active || !['execution_intended', 'execution_started'].includes(checked.value.kind)
  })
}
