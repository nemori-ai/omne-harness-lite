// query (SPEC 8). It recognizes an identity on the write path. The order of the answer is fixed:
// a saved receipt, then the pending index (unknown), and only then not_committed with five proofs.
// The proofs hold when the domain is ready: this generation ran path A (or path B), so the old
// write generation is excluded, the old transaction ended and the recovery is finished. The read
// just made on the write connection is the authoritative read.
import type { QueryResultV2, SqlIdentity, SqlStorage } from '@omne-harness/sql-contract'
import { type Core, identityKey, sameScope } from './core.ts'
import { decodeIdentity } from './fields.ts'
import type { QueryReply } from './worker/protocol.ts'

const PROOFS = {
  writerGenerationExcluded: true,
  oldTransactionTerminated: true,
  databaseRecoveryFinished: true,
  authoritativeReadSucceeded: true,
  operationNotQueued: true,
} as const

export function createQuery(core: Core): SqlStorage['query'] {
  return async (identity: SqlIdentity): Promise<QueryResultV2> => {
    const unknown = (text: string): QueryResultV2 => ({
      kind: 'unknown',
      identity,
      diagnostic: core.diagnostic(text),
    })
    if (core.lifecycle.closing) return unknown('closing')
    const decoded = decodeIdentity(identity)
    if (decoded.identity === null) return unknown('invalid_identity')
    const valid = decoded.identity
    const grant = core.admission.reserveQuery(valid.transactionDomain)
    if (grant === null) return unknown('queue_full')
    try {
      const outcome = await core.domains.ensure(valid.transactionDomain, null)
      if (outcome.kind === 'closing') return unknown('closing')
      // Absent, another scope, failed and quarantined domains give the same answer (SPEC 5.5).
      if (outcome.kind !== 'ready' || !sameScope(outcome.entry.scope, valid.scope))
        return unknown('domain_unavailable')
      const key = identityKey(valid)
      const pendingBefore = core.pending.has(key)
      const reply = await outcome.entry.client.request<QueryReply>({ kind: 'query', identity: valid })
      if (reply.kind === 'receipt') return reply.receipt
      if (reply.kind !== 'none') return unknown('provider_error')
      if (pendingBefore || core.pending.has(key)) return unknown('operation_pending')
      return { kind: 'not_committed', identity: valid, proofs: PROOFS }
    } catch {
      return unknown('provider_error')
    } finally {
      grant.release()
    }
  }
}
