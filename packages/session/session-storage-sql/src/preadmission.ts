import type { SessionId } from '@omne-harness/session-contract'
import type { FactCommandV2, JsonValue, RecordedReply } from '@omne-harness/sql-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { encodeValue } from './codec.ts'
import { EXECUTION_RECORD_PARTICIPANT, recordOf } from './session-reply.ts'

export type PreadmissionIntent = Readonly<{
  request: JsonValue
  origin: JsonValue
  principal: JsonValue
  qualification: JsonValue
  adoption: JsonValue
  materials: JsonValue
}>

export type PreadmissionIntentWrite = Readonly<{
  phase: 'intent'
  tenant: TenantId
  handoff: string
  entry: string | null
  session: SessionId | null
  execution: string | null
  intent: PreadmissionIntent
}>

export type PreadmissionOutcome = Readonly<{ kind: 'prepared' | 'rejected' }> &
  Readonly<{ [key: string]: JsonValue }>

export type PreadmissionOutcomeWrite = Readonly<{
  phase: 'outcome'
  tenant: TenantId
  handoff: string
  outcome: PreadmissionOutcome
}>

export function preadmissionFacts(
  write: PreadmissionIntentWrite | PreadmissionOutcomeWrite,
): FactCommandV2 {
  const { phase, tenant, ...rest } = write
  return {
    participant: EXECUTION_RECORD_PARTICIPANT,
    facts: {
      intent: 'preadmission',
      phase,
      write: { ...(rest as Readonly<Record<string, JsonValue>>), tenant: encodeValue(tenant) },
    },
  }
}

export type PreadmissionRecord = Readonly<{
  tenant: string
  handoff: string
  entry: string | null
  session: string | null
  execution: string | null
  intent: JsonValue
  intentDigest: string
  outcome: JsonValue | null
  outcomeDigest: string | null
}>

const textOrNull = (value: JsonValue | undefined): value is string | null =>
  value === null || typeof value === 'string'

export function decodePreadmissionRecord(
  output: JsonValue,
): PreadmissionRecord | null | 'malformed' {
  if (output === null) return null
  const value = recordOf(output)
  if (value === null) return 'malformed'
  const { tenant, handoff, entry, session, execution, intentDigest, outcomeDigest } = value
  return typeof tenant === 'string' &&
    typeof handoff === 'string' &&
    typeof intentDigest === 'string' &&
    textOrNull(entry) &&
    textOrNull(session) &&
    textOrNull(execution) &&
    textOrNull(outcomeDigest) &&
    value['intent'] !== undefined
    ? {
        tenant,
        handoff,
        entry,
        session,
        execution,
        intent: value['intent'],
        intentDigest,
        outcome: value['outcome'] ?? null,
        outcomeDigest,
      }
    : 'malformed'
}

export type PreadmissionParticipation =
  | Readonly<{ kind: 'saved'; created: boolean; record: PreadmissionRecord }>
  | Readonly<{ kind: 'conflict'; record: PreadmissionRecord }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'unsupported'; reason: string }>

function decodeSaved(response: JsonValue | undefined): PreadmissionParticipation {
  const value = recordOf(response)
  const created = value?.['created']
  const record = decodePreadmissionRecord(value?.['record'] ?? null)
  return value?.['kind'] === 'saved' &&
    typeof created === 'boolean' &&
    record !== null &&
    record !== 'malformed'
    ? { kind: 'saved', created, record }
    : { kind: 'failed', diagnostic: 'a preadmission reply without its record' }
}

function decodeRefusal(basis: JsonValue | undefined): PreadmissionParticipation {
  const value = recordOf(basis)
  const reason = value?.['reason']
  if (value?.['kind'] === 'invalid' && typeof reason === 'string')
    return { kind: 'invalid', reason }
  const record = decodePreadmissionRecord(value?.['record'] ?? null)
  return value?.['kind'] === 'preadmission' && record !== null && record !== 'malformed'
    ? { kind: 'conflict', record }
    : { kind: 'failed', diagnostic: 'a preadmission conflict without a basis' }
}

export function decodePreadmissionReply(reply: RecordedReply): PreadmissionParticipation {
  switch (reply.kind) {
    case 'participated':
      return decodeSaved(reply.response)
    case 'conflict':
      return decodeRefusal(reply.basis)
    case 'unsupported': {
      const reason = recordOf(reply.basis)?.['reason']
      return { kind: 'unsupported', reason: typeof reason === 'string' ? reason : 'unsupported' }
    }
    case 'failed':
      return { kind: 'failed', diagnostic: `${reply.category}: ${reply.diagnostic}` }
  }
}

export type PreadmissionRead =
  | Readonly<{ tenant: string; handoff: string }>
  | Readonly<{ tenant: string; entry: string }>
