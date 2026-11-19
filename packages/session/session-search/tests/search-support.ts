import type { SessionId } from '@omne-harness/session-contract'
import { testingTenant } from '@omne-harness/session-contract/testing'
import {
  compileQuery,
  queryDigest,
  searchHistory,
  type SearchCursor,
  type SearchLimits,
  type SearchPage,
  type SearchQuery,
} from '../src/index.ts'
import { createMemoryIndex, createMemoryLog, indexThrough } from '../src/testing.ts'
import { LIMITS } from './support.ts'

export const TENANT = testingTenant(
  'org_h1st0rysearch0000000000000',
  'acc_h1st0rysearch0000000000000',
)
export const S1 = 'session-1' as SessionId
export const S2 = 'session-2' as SessionId
export const S3 = 'session-3' as SessionId

/** Small batches and pages so that every loop turns more than once; budgets out of the way. */
export const ROOMY: SearchLimits = {
  candidateBatch: 4,
  verifyBatch: 3,
  timeBudgetMs: 1_000_000,
  maxCandidates: 1_000_000,
  scanBytes: 1_000_000_000,
  tailPageBytes: 300,
  maxFrozen: 64,
}

export const said = (text: string, kind = 'message.user') => ({ kind, blocks: [{ text }] })

export function world() {
  const log = createMemoryLog()
  const index = createMemoryIndex()
  const clock = { now: 0, step: 0 }
  const deps = {
    index,
    log: log.reader,
    now: () => {
      clock.now += clock.step
      return clock.now
    },
  }
  type Asked = Readonly<{
    cursor?: SearchCursor | null
    pageSize?: number
    limits?: Partial<SearchLimits>
  }>
  const search = (query: SearchQuery, asked: Asked = {}) => {
    const compiled = compileQuery(query, LIMITS)
    if (typeof compiled === 'string') throw new Error(`refused: ${compiled}`)
    return searchHistory(deps, {
      tenant: TENANT,
      query: compiled,
      digest: queryDigest(query),
      cursor: asked.cursor ?? null,
      pageSize: asked.pageSize ?? 50,
      limits: { ...ROOMY, ...asked.limits },
    })
  }
  const page = async (query: SearchQuery, asked: Asked = {}): Promise<SearchPage> => {
    const answer = await search(query, asked)
    if ('failure' in answer) throw new Error(`failed: ${answer.failure}`)
    return answer.ok
  }
  /** Follows `next` to the end; `between` runs after each page that has one. */
  const pages = async (
    query: SearchQuery,
    asked: Asked = {},
    between: (turn: number) => Promise<void> = async () => {},
  ): Promise<readonly SearchPage[]> => {
    const all: SearchPage[] = []
    let cursor: SearchCursor | null = asked.cursor ?? null
    for (let turn = 0; turn < 10_000; turn += 1) {
      const got = await page(query, { ...asked, cursor })
      all.push(got)
      if (got.next === null) return all
      // A cursor goes out and comes back as plain data.
      cursor = JSON.parse(JSON.stringify(got.next)) as SearchCursor
      await between(turn)
    }
    throw new Error('the search did not end')
  }
  const scan = (query: SearchQuery): string[] => {
    const compiled = compileQuery(query, LIMITS)
    if (typeof compiled === 'string') throw new Error(`refused: ${compiled}`)
    return [...log.scan(compiled)].sort()
  }
  const follow = (generation: number, session: SessionId, upTo: string | null = null) =>
    indexThrough({ index, log: log.reader }, { tenant: TENANT, generation, session }, upTo as never)
  const followAll = async (generation: number) => {
    for (const session of log.sessions()) await follow(generation, session)
  }
  return { log, index, clock, deps, search, page, pages, scan, follow, followAll }
}

export const keysOf = (pages: readonly SearchPage[]): string[] =>
  pages.flatMap(page => page.hits.map(hit => `${hit.session}#${hit.position}`))
