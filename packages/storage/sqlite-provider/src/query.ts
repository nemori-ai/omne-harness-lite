import type { QueryResultV2, SqlIdentity, SqlStorage } from '@omne-harness/sql-contract'
import { type Core, identityKey, sameScope } from './core.ts'
import { decodeIdentity } from './fields.ts'
import type { QueryReply } from './worker/protocol.ts'
import { observeReply } from './writer-client.ts'

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
    if (valid.recall === 'never') return { kind: 'not_recallable', identity: valid }
    const grant = await core.admission.reserveQuery(valid.transactionDomain)
    if (grant.kind === 'closing') return unknown('closing')
    if (grant.kind !== 'granted') return unknown('queue_full')
    let expire: () => void = () => undefined
    const expired = new Promise<QueryResultV2>(resolve => {
      expire = () => resolve(unknown('reply_wait_expired'))
    })
    const unhold = core.domains.hold(valid.transactionDomain)
    const work = async (): Promise<QueryResultV2> => {
      try {
        const outcome = await core.domains.ensure(valid.transactionDomain, null)
        if (outcome.kind === 'closing' || core.lifecycle.closing) return unknown('closing')
        if (outcome.kind !== 'ready' || !sameScope(outcome.entry.scope, valid.scope))
          return unknown('domain_unavailable')
        const key = identityKey(valid)
        const pendingBefore = core.pending.has(key)
        const reply = await observeReply(
          () => outcome.entry.client.request<QueryReply>({ kind: 'query', identity: valid }),
          core.replyObservationMs,
          expire,
        )
        if (reply.kind === 'receipt') return reply.receipt
        if (reply.kind === 'withdrawn') return unknown('closing')
        if (reply.kind !== 'none') return unknown('provider_error')
        if (pendingBefore || core.pending.has(key)) return unknown('operation_pending')
        return { kind: 'not_committed', identity: valid, proofs: PROOFS }
      } catch {
        return unknown('provider_error')
      } finally {
        unhold()
        grant.release()
      }
    }
    return Promise.race([work(), expired])
  }
}
