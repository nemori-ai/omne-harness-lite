import { Context } from '@deepseek-ai/cordis'
import { evidence } from '@omne-harness/session-contract/testing'
import {
  SessionAccessCheckService,
  SessionHistoryIndexService,
  SessionHistoryLogService,
  SessionSearchCursorsService,
} from '@omne-harness/session-cordis-contract/cordis'
import type { SearchQuery, SearchCursorSeal } from '@omne-harness/session-search'
import { createMemoryIndex, createMemoryLog } from '@omne-harness/session-search/testing'
import type { SessionId } from '@omne-harness/session-contract'
import { describe, expect, it } from 'vitest'
import { createSessionSearchPlugin, type SessionSearchConfig } from '../src/cordis.ts'
import { TENANT_A } from './fixtures/tenants.ts'

const S1 = 'session-1' as SessionId
const NEEDLE: SearchQuery = {
  scope: { kind: 'tenant' },
  archived: 'all',
  from: null,
  to: null,
  kinds: [],
  modelReadable: 'any',
  content: { kind: 'literals', all: ['needle'], caseSensitive: false },
}
const CONFIG: SessionSearchConfig = {
  policy: {
    query: {
      maxGramsPerLiteral: 16,
      maxAlternatives: 32,
      maxLiterals: 8,
      maxLiteralLength: 256,
      maxPatternLength: 512,
      maxProgramSize: 4096,
      maxScopeSessions: 64,
    },
    search: {
      candidateBatch: 64,
      verifyBatch: 32,
      timeBudgetMs: 5000,
      maxCandidates: 10_000,
      scanBytes: 1 << 26,
      tailPageBytes: 1 << 20,
      maxFrozen: 64,
    },
    maxPageSize: 100,
    maxConcurrent: 2,
    maxQueued: 4,
  },
  follow: { pageBytes: 1 << 20, maxSteps: 16, intervalMs: 60_000, compactPages: 8 },
}
const said = (text: string) => ({ kind: 'message.user', blocks: [{ text }] })

class Access extends SessionAccessCheckService<unknown> {
  readonly check: SessionAccessCheckService<unknown>['check'] = async () => ({
    kind: 'allowed',
    evidence: evidence('search'),
  })
}
class Index extends SessionHistoryIndexService {
  readonly index = createMemoryIndex()
}
class Log extends SessionHistoryLogService {
  readonly memory = createMemoryLog()
  readonly log = this.memory.reader
}
class Cursors extends SessionSearchCursorsService {
  readonly seal: SearchCursorSeal = {
    seal: async (_tenant, cursor) => JSON.stringify(cursor),
    open: async (_tenant, sealed) => JSON.parse(sealed) as unknown,
  }
}

async function mounted(without: 'index' | null = null) {
  const ctx = new Context()
  const scopes = {
    access: await ctx.plugin({ name: 'access', apply: child => void new Access(child) }),
    log: await ctx.plugin({ name: 'log', apply: child => void new Log(child) }),
    cursors: await ctx.plugin({ name: 'cursors', apply: child => void new Cursors(child) }),
    index:
      without === 'index'
        ? null
        : await ctx.plugin({ name: 'index', apply: child => void new Index(child) }),
  }
  const search = await ctx.plugin(createSessionSearchPlugin(CONFIG))
  const log = (ctx.sessionHistoryLog as Log).memory
  const ask = () =>
    ctx.sessionSearch.search({
      principal: 'alice',
      tenant: TENANT_A,
      query: NEEDLE,
      cursor: null,
      pageSize: 10,
    })
  return { ctx, scopes, search, log, ask }
}
const committed = (ctx: Context) =>
  ctx.parallel('session-cordis-contract/committed', TENANT_A, S1, '1' as never, evidence('b'), [])

describe('the history search of a process', () => {
  it('answers a search under the key `sessionSearch`', async () => {
    const { ctx, log, ask } = await mounted()
    log.commit(S1, [said('a needle')], 1000)
    expect(ctx.get('sessionSearch')).toBeDefined()
    expect(await ask()).toMatchObject({ ok: { hits: [{ session: S1, position: '1' }] } })
  })

  it('a commit wakes the follower, and the index then stands at the head of the log', async () => {
    const { ctx, log } = await mounted()
    log.commit(S1, [said('a needle')], 1000)
    const { index } = ctx.sessionHistoryIndex as Index
    expect(await index.state(TENANT_A)).toEqual({ kind: 'absent' })
    await committed(ctx)
    await expect.poll(() => index.state(TENANT_A)).toEqual({ kind: 'ready', generation: 1 })
    expect(index.coverOf(1, S1)).toEqual({ through: '1', at: 1000 })
  })

  it('a search wakes the follower too: an index that is not there gets built', async () => {
    const { ctx, log, ask } = await mounted()
    log.commit(S1, [said('a needle')], 1000)
    await ask()
    const { index } = ctx.sessionHistoryIndex as Index
    await expect.poll(() => index.state(TENANT_A)).toMatchObject({ kind: 'ready' })
  })

  it('is not there without the index, and goes when the index goes', async () => {
    const bare = await mounted('index')
    expect(bare.ctx.get('sessionSearch')).toBeUndefined()
    const { ctx, scopes, log } = await mounted()
    log.commit(S1, [said('a needle')], 1000)
    const { index } = ctx.sessionHistoryIndex as Index
    await scopes.index!.dispose()
    expect(ctx.get('sessionSearch')).toBeUndefined()
    // Commits go on without it: nobody waits for the follower, and it follows nothing more.
    await committed(ctx)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(await index.state(TENANT_A)).toEqual({ kind: 'absent' })
  })
})
