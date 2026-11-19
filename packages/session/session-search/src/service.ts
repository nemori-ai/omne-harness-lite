import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionAccessCheck, SessionId } from '@omne-harness/session-contract'
import { parseCursor, queryDigest, type SearchCursor } from './cursor.ts'
import type { SearchHit } from './hit.ts'
import type { HistoryIndex } from './index-port.ts'
import type { HistoryLogReader } from './log-port.ts'
import { compileQuery, type CompiledQuery, type QueryLimits, type SearchQuery } from './query.ts'
import type { SearchLimits } from './search-run.ts'
import { searchHistory, type Incomplete } from './search.ts'

// The search as its callers see it: every page asks who may read, a tenant runs a bounded number
// of searches at a time, and the cursor goes out sealed.

export type SearchPolicy = Readonly<{
  query: QueryLimits
  search: SearchLimits
  maxPageSize: number
  maxConcurrent: number
  maxQueued: number
}>

export type HistorySearchRequest<P> = Readonly<{
  principal: P
  tenant: TenantId
  query: SearchQuery
  cursor: string | null
  pageSize: number
}>

export type HistorySearchPage = Readonly<{
  hits: readonly SearchHit[]
  next: string | null
  complete: boolean
  incomplete: Incomplete | null
}>

export type HistorySearchFailure =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'invalid'; field: 'query' | 'cursor' | 'pageSize'; reason: string }>
  | Readonly<{ kind: 'limited' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type HistorySearchReply = Promise<Outcome<HistorySearchPage, HistorySearchFailure>>

export interface HistorySearch<P> {
  search(input: HistorySearchRequest<P>): HistorySearchReply
}

/** Seals a cursor for one tenant and opens it again; what it cannot vouch for is `invalid`. */
export interface SearchCursorSeal {
  seal(tenant: TenantId, cursor: SearchCursor): Promise<string | null>
  open(tenant: TenantId, sealed: string): Promise<unknown | 'invalid' | 'unavailable'>
}

export type HistorySearchDeps<P> = Readonly<{
  access: SessionAccessCheck<P>
  index: HistoryIndex
  log: HistoryLogReader
  seal: SearchCursorSeal
  policy: SearchPolicy
  now(): number
  /** Told after each search, so that whoever follows the log can catch up or rebuild. */
  searched?(tenant: TenantId): void
}>

type Failed = Outcome<never, HistorySearchFailure>
const unavailable = (diagnostic: string): Failed => fail({ kind: 'unavailable', diagnostic })
const invalid = (field: 'query' | 'cursor' | 'pageSize', reason: string): Failed =>
  fail({ kind: 'invalid', field, reason })

type Gate = { running: number; waiting: (() => void)[] }

export function createHistorySearch<P>(deps: HistorySearchDeps<P>): HistorySearch<P> {
  const { policy } = deps
  const gates = new Map<string, Gate>()

  // The sessions of the list this principal may read the history of; null: the answer is not known.
  async function readable(
    input: HistorySearchRequest<P>,
    sessions: readonly SessionId[],
  ): Promise<ReadonlySet<SessionId> | null> {
    const allowed = new Set<SessionId>()
    const access = { principal: input.principal, tenant: input.tenant }
    for (const session of new Set(sessions)) {
      const target = { kind: 'session', session } as const
      const decision = await deps.access.check({ access, operation: 'history.begin', target })
      if (decision.kind === 'unavailable') return null
      if (decision.kind === 'allowed') allowed.add(session)
    }
    return allowed
  }

  async function opened(
    input: HistorySearchRequest<P>,
  ): Promise<Outcome<SearchCursor | null, HistorySearchFailure>> {
    if (input.cursor === null) return succeed(null)
    const found = await deps.seal.open(input.tenant, input.cursor)
    if (found === 'unavailable') return unavailable('the cursor cannot be verified now')
    const cursor = parseCursor(found)
    return cursor === null ? invalid('cursor', 'not a cursor of this search') : succeed(cursor)
  }

  async function page(
    input: HistorySearchRequest<P>,
    query: CompiledQuery,
    cursor: SearchCursor | null,
  ): HistorySearchReply {
    const found = await searchHistory(deps, {
      tenant: input.tenant,
      query,
      digest: queryDigest(input.query),
      cursor,
      pageSize: input.pageSize,
      limits: policy.search,
    })
    if ('failure' in found) {
      if (found.failure === 'cursor-stale') return invalid('cursor', 'the index was rebuilt')
      return unavailable(
        found.failure === 'index-broken'
          ? 'the history index is broken'
          : 'the history cannot be read now',
      )
    }
    const allowed = await readable(
      input,
      found.ok.hits.map(hit => hit.session),
    )
    if (allowed === null) return unavailable('the access basis is unavailable')
    const next = found.ok.next === null ? null : await deps.seal.seal(input.tenant, found.ok.next)
    if (found.ok.next !== null && next === null)
      return unavailable('the cursor cannot be sealed now')
    const { complete, incomplete } = found.ok
    const hits = found.ok.hits.filter(hit => allowed.has(hit.session))
    return succeed({ hits, next, complete, incomplete })
  }

  async function gated(tenant: TenantId, run: () => HistorySearchReply): HistorySearchReply {
    const key = JSON.stringify(tenant)
    const gate = gates.get(key) ?? { running: 0, waiting: [] }
    gates.set(key, gate)
    if (gate.running >= policy.maxConcurrent) {
      if (gate.waiting.length >= policy.maxQueued) return fail({ kind: 'limited' })
      await new Promise<void>(resume => gate.waiting.push(resume))
    } else gate.running += 1
    try {
      return await run()
    } finally {
      const resume = gate.waiting.shift()
      if (resume !== undefined) resume()
      else if ((gate.running -= 1) === 0) gates.delete(key)
    }
  }

  return {
    async search(input) {
      const { tenant, principal } = input
      if (
        !Number.isInteger(input.pageSize) ||
        input.pageSize < 1 ||
        input.pageSize > policy.maxPageSize
      )
        return invalid('pageSize', `from 1 to ${String(policy.maxPageSize)}`)
      const listing = { kind: 'tenant', tenant } as const
      const gate = await deps.access.check({
        access: { principal, tenant },
        operation: 'directory.list',
        target: listing,
      })
      if (gate.kind === 'unavailable') return unavailable('the access basis is unavailable')
      if (gate.kind === 'denied') return fail({ kind: 'denied' })
      const compiled = compileQuery(input.query, policy.query)
      if (typeof compiled === 'string') return invalid('query', compiled)
      const cursor = await opened(input)
      if ('failure' in cursor) return cursor
      // A named session that may not be read is left out like one that does not exist.
      let query = compiled
      if (compiled.scope.kind === 'sessions') {
        const allowed = await readable(input, compiled.scope.sessions)
        if (allowed === null) return unavailable('the access basis is unavailable')
        query = { ...compiled, scope: { kind: 'sessions', sessions: [...allowed] } }
      }
      try {
        return await gated(tenant, () => page(input, query, cursor.ok))
      } finally {
        deps.searched?.(tenant)
      }
    },
  }
}
