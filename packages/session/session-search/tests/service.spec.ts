import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  SessionAccessCheck,
  SessionAccessRequest,
  SessionId,
} from '@omne-harness/session-contract'
import { evidence, testingTenant } from '@omne-harness/session-contract/testing'
import {
  createHistorySearch,
  type HistorySearchPage,
  type SearchCursorSeal,
  type SearchPolicy,
  type SearchQuery,
} from '../src/index.ts'
import { ROOMY, S1, S2, S3, TENANT, said, world } from './search-support.ts'
import { LIMITS, literals, queryOf } from './support.ts'

const OTHER = testingTenant('org_h1st0rysearch0ther00000000', 'acc_h1st0rysearch0ther00000000')
const NEEDLE = queryOf({ content: literals(['needle']) })
const POLICY: SearchPolicy = {
  query: LIMITS,
  search: ROOMY,
  maxPageSize: 100,
  maxConcurrent: 2,
  maxQueued: 2,
}

function served(over: Partial<SearchPolicy> = {}) {
  const w = world()
  const asked: SessionAccessRequest<string>[] = []
  const refused = new Set<string>()
  // `accessFrom`: the access check answers up to this many questions, then is unavailable.
  const faults = { accessFrom: Infinity, seal: false, open: false }
  const access: SessionAccessCheck<string> = {
    async check(request) {
      asked.push(request)
      if (asked.length > faults.accessFrom) return { kind: 'unavailable', diagnostic: 'testing' }
      const target = request.target.kind === 'session' ? request.target.session : 'tenant'
      return refused.has(target)
        ? { kind: 'denied' }
        : { kind: 'allowed', evidence: evidence('search') }
    },
  }
  const seal: SearchCursorSeal = {
    seal: async (tenant, cursor) => (faults.seal ? null : JSON.stringify({ tenant, cursor })),
    async open(tenant, sealed) {
      if (faults.open) return 'unavailable'
      try {
        const parsed = JSON.parse(sealed) as { tenant: TenantId; cursor: unknown }
        return JSON.stringify(parsed.tenant) === JSON.stringify(tenant) ? parsed.cursor : 'invalid'
      } catch {
        return 'invalid'
      }
    },
  }
  const told: TenantId[] = []
  const search = createHistorySearch<string>({
    access,
    index: w.index,
    log: w.log.reader,
    seal,
    policy: { ...POLICY, ...over },
    now: () => 0,
    searched: tenant => told.push(tenant),
  })
  const ask = (query: SearchQuery, more: { cursor?: string | null; pageSize?: number } = {}) =>
    search.search({
      principal: 'alice',
      tenant: TENANT,
      query,
      cursor: null,
      pageSize: 50,
      ...more,
    })
  const page = async (query: SearchQuery, more: Parameters<typeof ask>[1] = {}) => {
    const answer = await ask(query, more)
    if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
    return answer.ok
  }
  return { w, search, ask, page, asked, refused, faults, told }
}

async function filled(
  over: Partial<SearchPolicy> = {},
  sessions: readonly SessionId[] = [S1, S2, S3],
) {
  const s = served(over)
  for (const session of sessions)
    for (let n = 1; n <= 2; n += 1)
      s.w.log.commit(session, [said(`needle ${n}`)], Number(session.at(-1)) * 100 + n)
  await s.w.followAll(s.w.index.ready())
  return s
}
const keys = (page: HistorySearchPage) =>
  page.hits.map(hit => `${hit.session}#${hit.position}`).sort()

describe('who may search and what they see (SL10, SE-9)', () => {
  it('asks for the right to list the tenant, then for each session it would show, on every page', async () => {
    const s = await filled()
    const first = await s.page(NEEDLE, { pageSize: 4 })
    expect(s.asked.map(request => request.operation)).toEqual([
      'directory.list',
      'history.begin',
      'history.begin',
    ])
    expect(s.asked.every(request => request.access.principal === 'alice')).toBe(true)
    expect(s.asked[0]!.target).toEqual({ kind: 'tenant', tenant: TENANT })
    s.asked.length = 0
    await s.page(NEEDLE, { pageSize: 4, cursor: first.next })
    expect(s.asked.map(request => request.operation)).toEqual(['directory.list', 'history.begin'])
  })

  it('refuses one who may not list the tenant, and says unavailable when that is not known', async () => {
    const s = await filled()
    s.refused.add('tenant')
    expect(await s.ask(NEEDLE)).toEqual({ failure: { kind: 'denied' } })
    s.refused.clear()
    s.faults.accessFrom = 0
    expect(await s.ask(NEEDLE)).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(s.w.index.reads.candidates).toBe(0)
  })

  it('answers for a session one may not read as for one that does not exist', async () => {
    const hidden = await filled()
    hidden.refused.add(S2)
    const absent = await filled({}, [S1, S3])
    absent.w.log.commit('session-9' as SessionId, [said('haystack')], 1)
    expect(await hidden.page(NEEDLE)).toEqual(await absent.page(NEEDLE))
    const named = queryOf({
      content: literals(['needle']),
      scope: { kind: 'sessions', sessions: [S1, S2] },
    })
    const unknown = {
      ...named,
      scope: { kind: 'sessions' as const, sessions: [S1, 'session-none' as SessionId] },
    }
    expect(keys(await hidden.page(named))).toEqual(['session-1#1', 'session-1#2'])
    expect(await hidden.page(named)).toEqual(await hidden.page(unknown))
    const only = queryOf({
      content: literals(['needle']),
      scope: { kind: 'sessions', sessions: [S2] },
    })
    expect(await hidden.page(only)).toEqual({
      hits: [],
      next: null,
      complete: true,
      incomplete: null,
    })
  })

  it('drops a session from later pages once the right to read it is gone', async () => {
    const s = await filled()
    const first = await s.page(NEEDLE, { pageSize: 2 })
    expect(keys(first)).toEqual(['session-3#1', 'session-3#2'])
    s.refused.add(S2)
    const second = await s.page(NEEDLE, { pageSize: 2, cursor: first.next })
    expect(second.hits).toEqual([])
    expect(keys(await s.page(NEEDLE, { pageSize: 2, cursor: second.next }))).toEqual([
      'session-1#1',
      'session-1#2',
    ])
  })

  it('says unavailable when the right to read a session is not known, naming none of its hits', async () => {
    const s = await filled()
    const cannot = {
      failure: { kind: 'unavailable', diagnostic: 'the access basis is unavailable' },
    }
    // The tenant may be listed; the first session a hit lies in cannot be asked about.
    s.faults.accessFrom = 1
    expect(await s.ask(NEEDLE)).toEqual(cannot)
    s.asked.length = 0
    s.w.index.reads.candidates = 0
    const named = queryOf({
      content: literals(['needle']),
      scope: { kind: 'sessions', sessions: [S1] },
    })
    expect(await s.ask(named)).toEqual(cannot)
    expect(s.w.index.reads.candidates).toBe(0)
  })
})

describe('what a search refuses and what it cannot do', () => {
  it.each([0, 101, 1.5, -1])('refuses a page size of %s', async pageSize => {
    const s = await filled()
    expect(await s.ask(NEEDLE, { pageSize })).toEqual({
      failure: { kind: 'invalid', field: 'pageSize', reason: 'from 1 to 100' },
    })
    expect(s.asked).toEqual([])
  })

  it('refuses a query the compiler refuses, with its reason', async () => {
    const s = await filled()
    expect(await s.ask(queryOf({ content: literals(['']) }))).toEqual({
      failure: { kind: 'invalid', field: 'query', reason: 'empty-literal' },
    })
    const pattern = { kind: 'regex' as const, pattern: '(', caseSensitive: true }
    expect(await s.ask(queryOf({ content: pattern }))).toEqual({
      failure: { kind: 'invalid', field: 'query', reason: 'pattern-invalid' },
    })
  })

  it('refuses a cursor that is not its own: garbage, another tenant, another query, an older index', async () => {
    const s = await filled()
    const { next } = await s.page(NEEDLE, { pageSize: 2 })
    const bad = {
      failure: { kind: 'invalid', field: 'cursor', reason: 'not a cursor of this search' },
    }
    expect(await s.ask(NEEDLE, { cursor: 'garbage' })).toEqual(bad)
    expect(
      await s.ask(NEEDLE, { cursor: JSON.stringify({ tenant: TENANT, cursor: { no: 1 } }) }),
    ).toEqual(bad)
    const elsewhere = {
      principal: 'alice',
      tenant: OTHER,
      query: NEEDLE,
      cursor: next,
      pageSize: 2,
    }
    expect(await s.search.search(elsewhere)).toEqual(bad)
    const stale = { failure: { kind: 'invalid', field: 'cursor', reason: 'the index was rebuilt' } }
    const other = queryOf({ content: literals(['needle']), modelReadable: 'only' })
    expect(await s.ask(other, { cursor: next })).toEqual(stale)
    const begun = await s.w.index.beginRebuild(TENANT, 3)
    if ('failure' in begun) throw new Error('begin')
    await s.w.followAll(begun.ok.generation)
    await s.w.index.adopt(TENANT, begun.ok.generation)
    expect(await s.ask(NEEDLE, { cursor: next })).toEqual(stale)
  })

  it('says unavailable, never "no hits", when a part it needs does not answer', async () => {
    const s = await filled()
    const { next } = await s.page(NEEDLE, { pageSize: 2 })
    const cannot = (diagnostic: string) => ({ failure: { kind: 'unavailable', diagnostic } })
    s.faults.open = true
    expect(await s.ask(NEEDLE, { cursor: next })).toEqual(
      cannot('the cursor cannot be verified now'),
    )
    s.faults.open = false
    s.faults.seal = true
    expect(await s.ask(NEEDLE, { pageSize: 2 })).toEqual(cannot('the cursor cannot be sealed now'))
    expect(await s.ask(NEEDLE)).toMatchObject({ ok: { next: null } })
    s.faults.seal = false
    s.w.index.faults.broken = true
    expect(await s.ask(NEEDLE)).toEqual(cannot('the history index is broken'))
    s.w.index.faults.broken = false
    s.w.log.faults.sessions = true
    expect(await s.ask(NEEDLE)).toEqual(cannot('the history cannot be read now'))
  })

  it('tells whoever follows the log after each search, also after one that failed', async () => {
    const s = await filled()
    await s.page(NEEDLE)
    s.w.log.faults.sessions = true
    await s.ask(NEEDLE)
    expect(s.told).toEqual([TENANT, TENANT])
    s.refused.add('tenant')
    await s.ask(NEEDLE)
    expect(s.told).toHaveLength(2)
  })
})

describe('how many searches of a tenant run at once (SH-5)', () => {
  function held(s: Awaited<ReturnType<typeof filled>>) {
    const sessions = s.w.log.reader.sessions.bind(s.w.log.reader)
    const waiting: (() => void)[] = []
    let entered = 0
    s.w.log.reader.sessions = async tenant => {
      entered += 1
      await new Promise<void>(resume => waiting.push(resume))
      return sessions(tenant)
    }
    return { release: () => waiting.shift()?.(), entered: () => entered }
  }
  const settle = () => new Promise(resolve => setTimeout(resolve, 5))

  it('runs up to the bound, queues up to the bound, and says limited beyond', async () => {
    const s = await filled({ maxConcurrent: 1, maxQueued: 1 })
    const gate = held(s)
    const first = s.ask(NEEDLE)
    const second = s.ask(NEEDLE)
    await settle()
    expect(gate.entered()).toBe(1)
    expect(await s.ask(NEEDLE)).toEqual({ failure: { kind: 'limited' } })
    gate.release()
    expect(await first).toMatchObject({ ok: { complete: true } })
    await settle()
    expect(gate.entered()).toBe(2)
    const third = s.ask(NEEDLE)
    expect(await s.ask(NEEDLE)).toEqual({ failure: { kind: 'limited' } })
    gate.release()
    expect(await second).toMatchObject({ ok: { complete: true } })
    await settle()
    gate.release()
    expect(await third).toMatchObject({ ok: { complete: true } })
    expect(gate.entered()).toBe(3)
  })

  it('frees its place when a search fails, and counts each tenant by itself', async () => {
    const s = await filled({ maxConcurrent: 1, maxQueued: 0 })
    s.w.log.faults.sessions = true
    expect(await s.ask(NEEDLE)).toMatchObject({ failure: { kind: 'unavailable' } })
    s.w.log.faults.sessions = false
    const gate = held(s)
    const running = s.ask(NEEDLE)
    await settle()
    expect(await s.ask(NEEDLE)).toEqual({ failure: { kind: 'limited' } })
    const elsewhere = s.search.search({
      principal: 'alice',
      tenant: OTHER,
      query: NEEDLE,
      cursor: null,
      pageSize: 5,
    })
    await settle()
    expect(gate.entered()).toBe(2)
    gate.release()
    gate.release()
    expect(await running).toMatchObject({ ok: { complete: true } })
    expect(await elsewhere).toMatchObject({ ok: {} })
    const again = s.ask(NEEDLE)
    await settle()
    gate.release()
    expect(await again).toMatchObject({ ok: { complete: true } })
  })
})
