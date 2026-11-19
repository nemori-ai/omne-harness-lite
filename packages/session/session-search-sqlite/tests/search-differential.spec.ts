// @module-tag slow
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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
} from '@omne-harness/session-search'
import {
  createMemoryLog,
  indexThrough,
  random,
  randomCommit,
  randomQuery,
} from '@omne-harness/session-search/testing'
import { createSqliteHistoryIndex, type SqliteHistoryIndex } from '../src/index.ts'

// SH-1 on the real index: files, FTS5 and two threads. The log is the one in memory, so what
// differs from the same cases in `session-search` is the index alone.

const TENANT = testingTenant('org_h1st0ryd1ff000000000000000', 'acc_h1st0ryd1ff000000000000000')
const SESSIONS = ['s-a', 's-b', 's-c', 's-d', 's-e'] as readonly string[] as readonly SessionId[]
const QUERY_LIMITS = {
  maxGramsPerLiteral: 16,
  maxAlternatives: 32,
  maxLiterals: 8,
  maxLiteralLength: 256,
  maxPatternLength: 512,
  maxProgramSize: 4096,
  maxScopeSessions: 64,
}
const ROOMY: SearchLimits = {
  candidateBatch: 4,
  verifyBatch: 3,
  timeBudgetMs: 1_000_000,
  maxCandidates: 1_000_000,
  scanBytes: 1_000_000_000,
  tailPageBytes: 300,
  maxFrozen: 64,
}

const roots: string[] = []
const indexes: SqliteHistoryIndex[] = []
afterEach(async () => {
  for (const index of indexes.splice(0)) await index.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function prepared(seed: number, rebuilding: boolean) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'history-index-diff-')))
  roots.push(root)
  const index = createSqliteHistoryIndex({ root })
  indexes.push(index)
  const log = createMemoryLog()
  const rng = random(seed)
  const clock = { at: 1000 }
  for (let n = 5 + rng.below(40); n > 0; n -= 1) randomCommit(log, rng, clock, SESSIONS)
  for (const session of log.sessions()) log.archive(session, rng.below(4) === 0)
  const deps = { index, log: log.reader }
  const begin = async () => {
    const begun = await index.beginRebuild(TENANT, log.sessions().length)
    if ('failure' in begun) throw new Error('begin')
    return begun.ok.generation
  }
  const cover = async (generation: number) => {
    for (const session of log.sessions()) {
      const upTo = rng.below(Number(log.tail(session)) + 1)
      if (upTo > 0)
        await indexThrough(deps, { tenant: TENANT, generation, session }, String(upTo) as never)
    }
  }
  const generation = await begin()
  await cover(generation)
  await index.adopt(TENANT, generation)
  if (rebuilding) await cover(await begin())
  const page = async (query: SearchQuery, cursor: SearchCursor | null, over: object) => {
    const compiled = compileQuery(query, QUERY_LIMITS)
    if (typeof compiled === 'string') throw new Error(compiled)
    const answer = await searchHistory(
      { ...deps, now: () => 0 },
      {
        tenant: TENANT,
        query: compiled,
        digest: queryDigest(query),
        cursor,
        pageSize: 50,
        limits: ROOMY,
        ...over,
      },
    )
    if ('failure' in answer) throw new Error(answer.failure)
    return answer.ok
  }
  const scan = (query: SearchQuery): string[] => {
    const compiled = compileQuery(query, QUERY_LIMITS)
    if (typeof compiled === 'string') throw new Error(compiled)
    return [...log.scan(compiled)].sort()
  }
  const follow = (session: SessionId) => indexThrough(deps, { tenant: TENANT, generation, session })
  return { log, rng, clock, page, scan, follow }
}

const keysOf = (pages: readonly SearchPage[]): string[] =>
  pages.flatMap(page => page.hits.map(hit => `${hit.session}#${hit.position}`))
const SEEDS = Array.from({ length: 24 }, (_, at) => 9001 + at * 17)

describe.each([false, true])('a search on the SQLite index, rebuilding: %s (SH-1)', rebuilding => {
  it('gives in one roomy page what a scan gives', async () => {
    for (const seed of SEEDS) {
      const w = await prepared(seed, rebuilding)
      for (let turn = 0; turn < 6; turn += 1) {
        const query = randomQuery(w.rng, w.clock.at, SESSIONS)
        const page = await w.page(query, null, { pageSize: 10_000 })
        const told = `seed ${seed}, query ${JSON.stringify(query)}`
        expect(page.complete, told).toBe(true)
        expect(keysOf([page]).sort(), told).toEqual(w.scan(query))
      }
    }
  }, 120_000)

  it('gives every entry once over pages, while the log and the index move on', async () => {
    for (const seed of SEEDS) {
      const w = await prepared(seed, rebuilding)
      const query = randomQuery(w.rng, w.clock.at + 500, SESSIONS)
      const told = `seed ${seed}, query ${JSON.stringify(query)}`
      const atStart = w.scan(query)
      const limits = {
        ...ROOMY,
        candidateBatch: 1 + w.rng.below(5),
        verifyBatch: 1 + w.rng.below(4),
        maxCandidates: 1 + w.rng.below(12),
        scanBytes: 100 + w.rng.below(1500),
        tailPageBytes: 1 + w.rng.below(600),
      }
      const pageSize = 1 + w.rng.below(6)
      const pages: SearchPage[] = []
      let cursor: SearchCursor | null = null
      for (let turn = 0; turn < 2000; turn += 1) {
        const got = await w.page(query, cursor, { pageSize, limits })
        pages.push(got)
        if (got.next === null) break
        cursor = JSON.parse(JSON.stringify(got.next)) as SearchCursor
        if (w.rng.below(2) === 0) randomCommit(w.log, w.rng, w.clock, SESSIONS)
        if (w.rng.below(2) === 0) await w.follow(w.rng.pick(w.log.sessions()))
      }
      const keys = keysOf(pages)
      expect(pages.at(-1), told).toMatchObject({ complete: true, next: null })
      expect(new Set(keys).size, told).toBe(keys.length)
      const atEnd = new Set(w.scan(query))
      expect(
        keys.filter(key => !atEnd.has(key)),
        told,
      ).toEqual([])
      const found = new Set(keys)
      expect(
        atStart.filter(key => !found.has(key)),
        told,
      ).toEqual([])
    }
  }, 120_000)
})
