// Fault injection at the storage boundary. The product code never sees these wrappers: it only
// holds a `SqlStorage`. The suite's `RecordStoreFaults` is mapped here onto the reads and the
// commits that stand for the account store, the login store and the organization store (identity
// SPEC ID-18: organizations, memberships, invitations and creation receipts). Every governance
// command and every governance query but the identifier pre-read checks the initiating login, so a
// silent login store fails them all.
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import type { RecordStore, RecordStoreFaults } from '@omne-harness/identity/testing'

const ISSUE_BASIS = 'identity.issue-basis'
const LOGIN_BY_PROOF = 'identity.login-by-proof'
const GOVERNANCE = 'identity.governance'

/** The record stores that each commit operation touches. */
const COMMIT_STORES: Readonly<Record<string, readonly RecordStore[]>> = {
  'identity.register-and-activate': ['accounts'],
  'identity.create-organization': ['logins', 'organizations'],
  'identity.issue-member-invitation': ['logins', 'organizations', 'accounts'],
  'identity.dispose-member-invitation': ['logins', 'organizations'],
  'identity.leave-organization': ['logins', 'organizations'],
  'identity.change-member': ['logins', 'organizations'],
  'identity.switch-current-tenant': ['logins', 'organizations'],
  'identity.revoke-login': ['logins'],
  'identity.report-business-access': ['logins'],
}

/** The record stores that each governance query reads. */
const QUERY_STORES: Readonly<Record<string, readonly RecordStore[]>> = {
  'create-receipt': ['logins', 'organizations'],
  invitation: ['logins', 'organizations'],
  received: ['logins', 'organizations'],
  issued: ['logins', 'organizations'],
  'own-memberships': ['logins', 'organizations'],
  members: ['logins', 'organizations'],
  'current-tenant': ['logins'],
  'own-logins': ['logins'],
  'account-of': ['accounts'],
  'login-terms': ['logins'],
}

function queryOf(input: JsonValue): string {
  if (typeof input !== 'object' || input === null) return ''
  const query: unknown = Reflect.get(input, 'query')
  return typeof query === 'string' ? query : ''
}

function readStores(handler: string, input: JsonValue): readonly RecordStore[] {
  if (handler === ISSUE_BASIS) return ['accounts', 'logins']
  if (handler === LOGIN_BY_PROOF) return ['logins']
  if (handler === GOVERNANCE) return QUERY_STORES[queryOf(input)] ?? []
  return []
}

function firstDown(faults: RecordStoreFaults, stores: readonly RecordStore[]): string | undefined {
  for (const store of stores) {
    const diagnostic = faults.unavailable(store)
    if (diagnostic !== undefined) return diagnostic
  }
  return undefined
}

/** A store that is down fails every read and every commit that touches it, before it runs. */
export function withRecordFaults(storage: SqlStorage, faults: RecordStoreFaults): SqlStorage {
  return {
    registerCombination: input => storage.registerCombination(input),
    query: identity => storage.query(identity),
    read(request, options) {
      if (firstDown(faults, readStores(request.handler, request.input)) !== undefined)
        return Promise.resolve({
          kind: 'unavailable',
          requestKey: request.requestKey,
          reason: 'read_failed',
          diagnostic: 'suite fault',
        })
      return storage.read(request, options)
    },
    commit(request, options) {
      const stores = COMMIT_STORES[request.identity.operation] ?? []
      if (firstDown(faults, stores) !== undefined)
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
