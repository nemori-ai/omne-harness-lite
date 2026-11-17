import type { DurableEvidence } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue } from './codec.ts'

export const SESSION_CURRENT_ADVANCE_HANDLER = 'session.current-advance'

export type SessionCurrentAdvance = Readonly<{
  execution: string
  attempt: string
  grant: DurableEvidence
}>

export type SessionCurrentAdvanceRead =
  | Readonly<{ kind: 'absent' | 'behind' | 'none' }>
  | Readonly<{ kind: 'advance'; value: SessionCurrentAdvance }>

export function decodeSessionCurrentAdvance(value: JsonValue): SessionCurrentAdvanceRead {
  const data = decodeValue(value) as Partial<SessionCurrentAdvanceRead> | null
  if (data?.kind === 'absent' || data?.kind === 'behind' || data?.kind === 'none')
    return { kind: data.kind }
  if (
    data?.kind !== 'advance' ||
    data.value === undefined ||
    typeof data.value.execution !== 'string' ||
    data.value.execution.length === 0 ||
    typeof data.value.attempt !== 'string' ||
    data.value.attempt.length === 0
  )
    throw new TypeError('invalid current advance')
  const grant = data.value.grant
  if (
    grant === null ||
    typeof grant !== 'object' ||
    ![grant.owner, grant.record, grant.revision, grant.digest].every(
      part => typeof part === 'string' && part.length > 0,
    )
  )
    throw new TypeError('invalid current advance grant')
  return { kind: 'advance', value: data.value }
}
