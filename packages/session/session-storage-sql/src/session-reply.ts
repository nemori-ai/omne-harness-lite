import { tenantCodec } from '@omne-harness/legal-identity'
import type {
  DurableEvidence,
  SessionFailure,
  SessionNotifier,
} from '@omne-harness/session-contract'
import type { JsonValue, RecordedReply } from '@omne-harness/sql-contract'
import { decodeValue, isCount } from './codec.ts'
import type { WorkFold } from './work-cache.ts'

export const SESSION_PARTICIPANT = 'session'
export const EXECUTION_RECORD_PARTICIPANT = 'execution-record'

export type SessionParticipation =
  | Readonly<{
      kind: 'participated'
      result: unknown
      recovered: boolean
      digest: string
      work?: SessionWorkReply
      batch?: SessionCommittedBatch
    }>
  | Readonly<{ kind: 'stopped'; failure: SessionFailure }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'unsupported'; reason: string }>

export type SessionWorkReply = WorkFold

export type SessionCommittedBatch = Parameters<SessionNotifier['committed']>[0]

export function isJsonRecord(
  value: JsonValue | undefined,
): value is Readonly<{ readonly [key: string]: JsonValue }> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function recordOf(
  value: JsonValue | undefined,
): Readonly<{ readonly [key: string]: JsonValue }> | null {
  return isJsonRecord(value) ? value : null
}

function workReplyOf(value: JsonValue | undefined): SessionWorkReply | undefined {
  const work = recordOf(value)
  if (work === null) return undefined
  const { tail, published, bytes, first, last, indexed, basis } = work
  const counts = [tail, published, first, last].every(isCount)
  if (!counts || typeof bytes !== 'number' || typeof indexed !== 'boolean') return undefined
  return {
    tail: tail as string,
    published: published as string,
    bytes,
    first: first as string,
    last: last as string,
    indexed,
    ...(basis === undefined ? {} : { basis }),
  }
}

function evidenceOf(value: JsonValue | undefined): DurableEvidence | undefined {
  const record = recordOf(value)
  if (record === null) return undefined
  const { owner, record: name, revision, digest } = record
  return [owner, name, revision, digest].every(member => typeof member === 'string')
    ? ({ owner, record: name, revision, digest } as DurableEvidence)
    : undefined
}

function batchReplyOf(value: JsonValue | undefined): SessionCommittedBatch | undefined {
  const batch = recordOf(value)
  if (batch === null) return undefined
  const { tenant, session, revision, source, kinds } = batch
  const evidence = evidenceOf(source)
  if (typeof tenant !== 'string' || typeof session !== 'string' || !isCount(revision))
    return undefined
  if (evidence === undefined || !Array.isArray(kinds)) return undefined
  if (!kinds.every(kind => typeof kind === 'string')) return undefined
  const parsed = tenantCodec.parse(tenant)
  if (!parsed.ok) return undefined
  return {
    tenant: parsed.value,
    session: session as SessionCommittedBatch['session'],
    revision: revision as SessionCommittedBatch['revision'],
    source: evidence,
    kinds: kinds as readonly string[],
  }
}

function freshOf(
  response: Readonly<{ readonly [key: string]: JsonValue }>,
): Readonly<{ work?: SessionWorkReply; batch?: SessionCommittedBatch }> {
  const work = workReplyOf(response['work'])
  const batch = batchReplyOf(response['batch'])
  return { ...(work === undefined ? {} : { work }), ...(batch === undefined ? {} : { batch }) }
}

function participationOf(response: JsonValue): SessionParticipation {
  const record = recordOf(response)
  const digest = record?.['digest']
  if (record === null || typeof digest !== 'string')
    return { kind: 'failed', diagnostic: 'a session reply without a digest' }
  return {
    kind: 'participated',
    result: decodeValue(record['result'] ?? null),
    recovered: record['recovered'] === true,
    digest,
    ...freshOf(record),
  }
}

export function decodeSessionReply(reply: RecordedReply): SessionParticipation {
  switch (reply.kind) {
    case 'participated':
      return participationOf(reply.response)
    case 'conflict': {
      const failure = recordOf(reply.basis)?.['failure']
      return failure === undefined
        ? { kind: 'failed', diagnostic: 'a session conflict without a failure' }
        : { kind: 'stopped', failure: decodeValue(failure) as SessionFailure }
    }
    case 'unsupported': {
      const reason = recordOf(reply.basis)?.['reason']
      return { kind: 'unsupported', reason: typeof reason === 'string' ? reason : 'unsupported' }
    }
    case 'failed':
      return { kind: 'failed', diagnostic: `${reply.category}: ${reply.diagnostic}` }
  }
}

export function writtenOf(
  reply: RecordedReply,
): Readonly<{ work?: SessionWorkReply; batch?: SessionCommittedBatch }> | null {
  if (reply.kind !== 'participated') return null
  const response = recordOf(reply.response)
  if (response === null || typeof response['digest'] !== 'string') return null
  if (response['recovered'] === true) return null
  return freshOf(response)
}
