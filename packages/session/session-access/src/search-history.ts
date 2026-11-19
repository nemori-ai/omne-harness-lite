import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SessionId } from '@omne-harness/session-contract'
import type { HistorySearch, SearchQuery } from '@omne-harness/session-search'
import { encodeInstant, parseInstant, type Instant } from '@omne-harness/utc-instant'
import { readCall, UNAVAILABLE, type Answer, type Body, type Refusal } from './answers.ts'

export type SearchPorts = Readonly<{
  principalFor(
    login: LoginIdentity,
    tenant: TenantId,
  ): Promise<Readonly<{ principal: Principal }> | Refusal>
  searching(): HistorySearch<Principal> | undefined
}>

const DEFAULT_PAGE = 20

// The search counts commit times in milliseconds; the protocol carries instants.
const millisOf = (instant: Instant | null | undefined): number | null =>
  instant == null ? null : Date.parse(encodeInstant(instant))

function instantOf(millis: number | null): Instant | null | undefined {
  if (millis === null) return null
  const date = new Date(millis)
  if (Number.isNaN(date.getTime())) return undefined
  const parsed = parseInstant(date.toISOString())
  return parsed.ok ? parsed.value : undefined
}

function queryOf(body: Body<'search-history'>): SearchQuery {
  const sessions = body.sessions ?? null
  return {
    scope:
      sessions === null
        ? { kind: 'tenant' }
        : { kind: 'sessions', sessions: sessions as readonly string[] as readonly SessionId[] },
    archived: body.archived ?? 'all',
    from: millisOf(body.from),
    to: millisOf(body.to),
    kinds: body.kinds ?? [],
    // What the model can read is what a search is for unless it says otherwise.
    modelReadable: body.modelReadable ?? 'only',
    content: body.content,
  }
}

export async function searchHistory(
  ports: SearchPorts,
  login: LoginIdentity,
  body: Body<'search-history'>,
): Promise<Answer<'search-history'>> {
  const issued = await ports.principalFor(login, body.tenant)
  if ('outcome' in issued) return issued
  const search = ports.searching()
  if (search === undefined) return UNAVAILABLE
  const { principal } = issued
  const asked = { principal, tenant: body.tenant, query: queryOf(body), cursor: body.cursor }
  const result = await readCall(() =>
    search.search({ ...asked, pageSize: body.limit ?? DEFAULT_PAGE }),
  )
  if (result === 'basis-unavailable') return UNAVAILABLE
  if ('failure' in result) {
    const { failure } = result
    if (failure.kind === 'unavailable') return UNAVAILABLE
    if (failure.kind === 'invalid') {
      const field = failure.field === 'pageSize' ? 'limit' : failure.field
      return { outcome: 'invalid', body: { field, reason: failure.reason } }
    }
    return failure.kind === 'limited' ? { outcome: 'limited', body: {} } : { outcome: 'denied' }
  }
  const hits = []
  for (const hit of result.ok.hits) {
    const at = instantOf(hit.at)
    // A time the protocol cannot carry is a fault of the store, not an empty answer.
    if (at === undefined) return UNAVAILABLE
    hits.push({ ...hit, at })
  }
  const { next, complete, incomplete } = result.ok
  return { outcome: 'succeeded', body: { hits, next, complete, incomplete } }
}
