import {
  inputDigestV2,
  type SqlStorage,
  type CommitRequestV2,
  type CommittedV2,
  type RolledBackV2,
  type NotCommittedV2,
  type CommitResultV2,
  type QueryResultV2,
  type SqlIdentity,
  type JsonValue,
} from '@omne-harness/sql-contract'
import { GOVERNANCE_OWNER } from './migration.ts'
import { equal } from './encoding.ts'

export type SqlSubmission =
  | { kind: 'applied'; response: JsonValue; receipt: CommittedV2 }
  | { kind: 'rolled-back'; receipt: RolledBackV2 }
  | { kind: 'not-committed'; proof: NotCommittedV2 }
  | { kind: 'unknown'; identity: SqlIdentity }
  | { kind: 'conflict'; reason: 'operation' }
  | { kind: 'unavailable'; owner: 'sql-coordination' }
export const unavailable = () => ({
  kind: 'unavailable' as const,
  owner: 'sql-coordination' as const,
})
export function writerResponse(receipt: CommittedV2) {
  const entries = receipt.responses.filter(entry => entry.participant === GOVERNANCE_OWNER)
  const entry = entries[0]
  return entries.length === 1 && entry?.reply.kind === 'participated'
    ? { kind: 'response' as const, value: entry.reply.response }
    : unavailable()
}
function recognizeReceipt(
  envelope: CommitRequestV2,
  receipt: CommittedV2 | RolledBackV2,
): SqlSubmission {
  if (
    !equal(receipt.identity, envelope.identity) ||
    receipt.inputDigest !== inputDigestV2(envelope) ||
    receipt.combinationVersion !== envelope.combinationVersion ||
    receipt.manifestDigest !== envelope.manifestDigest
  )
    return { kind: 'conflict', reason: 'operation' }
  if (receipt.kind === 'rolled_back') return { kind: 'rolled-back', receipt }
  const reply = writerResponse(receipt)
  return reply.kind === 'response' ? { kind: 'applied', response: reply.value, receipt } : reply
}
export function recognizeSubmission(
  envelope: CommitRequestV2,
  raw: CommitResultV2 | QueryResultV2,
): SqlSubmission {
  if (!equal(raw.identity, envelope.identity)) return unavailable()
  const result = raw.kind === 'identity_conflict' ? raw.existing : raw
  switch (result.kind) {
    case 'committed':
    case 'rolled_back':
      return recognizeReceipt(envelope, result)
    case 'not_committed':
      return { kind: 'not-committed', proof: result }
    case 'unknown':
      return { kind: 'unknown', identity: envelope.identity }
    case 'rejected_before_accept':
      return unavailable()
  }
}
export async function querySql(storage: SqlStorage, identity: SqlIdentity): Promise<QueryResultV2> {
  try {
    return await storage.query(identity)
  } catch {
    return { kind: 'unknown', identity, diagnostic: null }
  }
}
export async function submitSql(
  storage: SqlStorage,
  envelope: CommitRequestV2,
): Promise<SqlSubmission> {
  try {
    const result = await storage.commit(envelope)
    return recognizeSubmission(
      envelope,
      result.kind === 'unknown' ? await querySql(storage, envelope.identity) : result,
    )
  } catch {
    return { kind: 'unknown', identity: envelope.identity }
  }
}
