// Fault injection at the storage boundary. The product code never sees these wrappers: it only
// holds a `SqlStorage`. The suite's `RecordStoreFaults` is mapped here onto the reads and the
// commit that stand for the account store and the login store.
import type { SqlStorage } from '@omne-harness/sql-contract'
import type { RecordStoreFaults } from '@omne-harness/identity/testing'

const ISSUE_BASIS = 'identity.issue-basis'
const LOGIN_BY_PROOF = 'identity.login-by-proof'
const REGISTER = 'identity.register-and-activate'

/** `accounts` down: the issue basis read and the registration commit fail. `logins` down: both login reads fail. */
export function withRecordFaults(storage: SqlStorage, faults: RecordStoreFaults): SqlStorage {
  return {
    registerCombination: input => storage.registerCombination(input),
    query: identity => storage.query(identity),
    read(request, options) {
      const accounts = faults.unavailable('accounts')
      const logins = faults.unavailable('logins')
      let down: string | undefined
      if (request.handler === ISSUE_BASIS) down = accounts ?? logins
      if (request.handler === LOGIN_BY_PROOF) down = logins
      if (down !== undefined)
        return Promise.resolve({
          kind: 'unavailable',
          requestKey: request.requestKey,
          reason: 'read_failed',
          diagnostic: 'suite fault',
        })
      return storage.read(request, options)
    },
    commit(request, options) {
      const accounts = faults.unavailable('accounts')
      if (accounts !== undefined && request.identity.operation === REGISTER)
        return Promise.resolve({
          kind: 'rejected_before_accept',
          identity: request.identity,
          reason: 'domain_unavailable',
          diagnostic: 'suite fault',
        })
      return storage.commit(request, options)
    },
  }
}

/** Every read of `handler` answers unavailable. */
export function withFailingRead(storage: SqlStorage, handler: string): SqlStorage {
  return {
    ...storage,
    registerCombination: input => storage.registerCombination(input),
    query: identity => storage.query(identity),
    commit: (request, options) => storage.commit(request, options),
    read(request, options) {
      if (request.handler === handler)
        return Promise.resolve({
          kind: 'unavailable',
          requestKey: request.requestKey,
          reason: 'read_failed',
          diagnostic: 'test fault',
        })
      return storage.read(request, options)
    },
  }
}

export type ReplyLoss = Readonly<{
  /** `lost`: the commit runs, the caller gets `unknown`. `through`: the real result. */
  commit: 'lost' | 'through'
  /** `unknown`: every query answers `unknown`. `through`: the real result. */
  query: 'unknown' | 'through'
}>

/** Loses commit replies and, optionally, makes the recall query silent. Counts the queries. */
export function withLostReplies(
  storage: SqlStorage,
  loss: ReplyLoss,
): SqlStorage & { queries(): number } {
  let queries = 0
  return {
    registerCombination: input => storage.registerCombination(input),
    read: (request, options) => storage.read(request, options),
    async commit(request, options) {
      const result = await storage.commit(request, options)
      return loss.commit === 'lost'
        ? { kind: 'unknown', identity: request.identity, diagnostic: 'reply lost' }
        : result
    },
    async query(identity) {
      queries += 1
      if (loss.query === 'unknown') return { kind: 'unknown', identity, diagnostic: 'silent' }
      return storage.query(identity)
    },
    queries: () => queries,
  }
}
