import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import type { RecordStore, RecordStoreFaults } from '@omne-harness/identity/testing'

const ISSUE_BASIS = 'identity.issue-basis'
const LOGIN_BY_PROOF = 'identity.login-by-proof'
const GOVERNANCE = 'identity.governance'

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

export function withRecordFaults(storage: SqlStorage, faults: RecordStoreFaults): SqlStorage {
  return {
    database: storage.database,
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
  commit: 'lost' | 'through'
  query: 'unknown' | 'through'
}>

export function withLostReplies(
  storage: SqlStorage,
  loss: ReplyLoss,
): SqlStorage & { queries(): number } {
  let queries = 0
  return {
    database: storage.database,
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
