// The reply of the `session` participant as a committer reads it back from a storage receipt:
// the result, whether it recalls a committed original, the digest it answers, and for a batch that
// it wrote now, what that batch tells the work cache (`work`) and the batch itself (`batch`, the
// five values of a commit notice). Pure functions over the data format; `participants.ts` and the
// one landing of a commit (`committed.ts`) both read replies through here.
import { tenantCodec } from '@omne-harness/legal-identity'
import type {
  DurableEvidence,
  SessionFailure,
  SessionNotifier,
} from '@omne-harness/session-contract'
import type { JsonValue, RecordedReply } from '@omne-harness/sql-contract'
import { decodeValue, isCount } from './codec.ts'
import type { WorkFold } from './work-cache.ts'

/** The participant that executes the Session commands and the read-only checks. */
export const SESSION_PARTICIPANT = 'session'

/**
 * The reply of the `session` participant, decoded.
 *
 * - `participated`: the result of the command or check, whether it is the recall of a committed
 *   original, and the digest of the command or check it answers. A caller compares the digest
 *   with `commandDigest` (or `sessionCheckDigest`): equal is the same command, another digest is
 *   another command under the same identity.
 * - `stopped`: the Session failure the participant stopped on (a conflict reply).
 * - `failed`: the participant could not do its part (a dependency or storage failure).
 * - `unsupported`: the facts are not a command, a check, an entries commit or a query.
 */
export type SessionParticipation =
  | Readonly<{
      kind: 'participated'
      result: unknown
      recovered: boolean
      digest: string
      /** What a fresh batch tells the work cache (SPEC RT-04); absent on a recall. */
      work?: SessionWorkReply
      /** The batch the participant wrote in this commit; absent when it wrote no entry. */
      batch?: SessionCommittedBatch
    }>
  | Readonly<{ kind: 'stopped'; failure: SessionFailure }>
  | Readonly<{ kind: 'failed'; diagnostic: string }>
  | Readonly<{ kind: 'unsupported'; reason: string }>

/**
 * What a published Session batch tells the work cache of the main thread (C-TOPOLOGY §2.9): the
 * fold of the work cache (`WorkFold`), under the name of this vocabulary.
 */
export type SessionWorkReply = WorkFold

/**
 * The batch one commit wrote, as the writer gave it (SPEC「本批与提交通知」): the tenant and the
 * session of the write, the revision of the batch, the evidence of its batch receipt and the kinds
 * of its entries without repeats. It is the payload of `SessionNotifier.committed`.
 */
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

/** The batch of a reply; undefined when absent or malformed, so a reply never fails on it. */
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

/** The work and the batch of a reply, each only when present and well formed. */
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

/**
 * What the reply of a commit this caller sent tells after it committed, read field by field:
 * the `work` and the `batch` of a batch the participant wrote now. Null when the participant did
 * not take part, answered a recall (`recovered`) or gave no digest. It never decodes the `result`,
 * so a result the caller cannot decode cannot reach it, and it never throws.
 */
export function writtenOf(
  reply: RecordedReply,
): Readonly<{ work?: SessionWorkReply; batch?: SessionCommittedBatch }> | null {
  if (reply.kind !== 'participated') return null
  const response = recordOf(reply.response)
  if (response === null || typeof response['digest'] !== 'string') return null
  if (response['recovered'] === true) return null
  return freshOf(response)
}
