import { describe, expect, it } from 'vitest'
import {
  compileQuery,
  parseCursor,
  queryDigest,
  searchHistory,
  type SearchCursor,
  type SearchQuery,
} from '../src/index.ts'
import { LIMITS, literals, queryOf } from './support.ts'
import { ROOMY, S1, S2, S3, TENANT, keysOf, said, world } from './search-support.ts'

// The three rules the model SearchCoverage states for a search. Each case names the rule it
// keeps; a control beside it breaks the rule and shows the same search then goes wrong.

const NEEDLE = queryOf({ content: literals(['needle']) })
function compiledOf(query: SearchQuery) {
  const compiled = compileQuery(query, LIMITS)
  if (typeof compiled === 'string') throw new Error(compiled)
  return compiled
}

describe('rule: the covers are read before the rows, or in one read with them', () => {
  // An entry is in the log and not yet in the index when the search begins. While the candidates
  // are being read, the follower puts it in and moves the cover over it.
  async function race(coverAfterRows: boolean) {
    const w = world()
    const generation = w.index.ready()
    w.log.commit(S1, [said('needle indexed')], 1000)
    await w.follow(generation, S1)
    w.log.commit(S1, [said('needle racing')], 2000)
    w.index.faults.coverAfterRows = coverAfterRows
    w.index.faults.duringCandidates = async () => {
      w.index.faults.duringCandidates = null
      await w.follow(generation, S1)
    }
    return keysOf([await w.page(NEEDLE)]).sort()
  }

  it('finds an entry the follower indexes while the candidates are read', async () => {
    expect(await race(false)).toEqual(['session-1#1', 'session-1#2'])
  })

  it('control: an index that reads its covers after its rows loses that entry', async () => {
    expect(await race(true)).toEqual(['session-1#1'])
  })

  it('judges later pages by the covers the first page read, whatever the index learned since', async () => {
    const w = world()
    const generation = w.index.ready()
    for (let turn = 1; turn <= 4; turn += 1) w.log.commit(S1, [said(`needle ${turn}`)], turn * 100)
    await w.follow(generation, S1, '1')
    const first = await w.page(NEEDLE, { pageSize: 2 })
    expect(first.next?.frozen).toEqual([[S1, '1', 100]])
    await w.follow(generation, S1)
    w.log.commit(S1, [said('needle 5')], 500)
    const pages = [first, ...(await w.pages(NEEDLE, { pageSize: 2, cursor: first.next }))]
    const keys = keysOf(pages)
    expect([...keys].sort()).toEqual(w.scan(NEEDLE))
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('rule: one search, one generation', () => {
  async function paged() {
    const w = world()
    const generation = w.index.ready()
    for (let turn = 1; turn <= 5; turn += 1) w.log.commit(S1, [said(`needle ${turn}`)], turn * 100)
    await w.followAll(generation)
    const first = await w.page(NEEDLE, { pageSize: 2 })
    return { w, generation, cursor: first.next! }
  }
  async function rebuilt(w: ReturnType<typeof world>) {
    const begun = await w.index.beginRebuild(TENANT, 1)
    if ('failure' in begun) throw new Error('begin')
    await w.followAll(begun.ok.generation)
    await w.index.adopt(TENANT, begun.ok.generation)
  }

  it('refuses the cursor of a generation that was replaced between two pages', async () => {
    const { w, cursor } = await paged()
    await rebuilt(w)
    expect(await w.search(NEEDLE, { pageSize: 2, cursor })).toEqual({ failure: 'cursor-stale' })
    expect(await w.search(NEEDLE, { pageSize: 2 })).toMatchObject({ ok: { complete: true } })
  })

  it('refuses a cursor when the generation goes while the page is being read', async () => {
    const { w, cursor } = await paged()
    let reads = 0
    w.index.faults.duringCandidates = async () => {
      reads += 1
      if (reads === 1) await rebuilt(w)
    }
    const limits = { candidateBatch: 2 }
    expect(await w.search(NEEDLE, { limits, cursor })).toEqual({ failure: 'cursor-stale' })
  })

  it('says unavailable, not a half answer, when a first page loses its generation', async () => {
    const { w } = await paged()
    w.index.faults.duringCandidates = async () => {
      w.index.faults.duringCandidates = null
      await rebuilt(w)
    }
    expect(await w.search(NEEDLE)).toEqual({ failure: 'unavailable' })
    expect(keysOf([await w.page(NEEDLE)])).toHaveLength(5)
  })

  it('sees the generation go between asking for the state and asking for candidates', async () => {
    const { w, cursor } = await paged()
    const state = w.index.state.bind(w.index)
    const racing = {
      ...w.deps,
      index: {
        ...w.index,
        state: async (tenant: typeof TENANT) => {
          const told = await state(tenant)
          await rebuilt(w)
          return told
        },
      },
    }
    const input = {
      tenant: TENANT,
      query: compiledOf(NEEDLE),
      digest: queryDigest(NEEDLE),
      pageSize: 2,
      limits: ROOMY,
    }
    expect(await searchHistory(racing, { ...input, cursor })).toEqual({ failure: 'cursor-stale' })
    expect(await searchHistory(racing, { ...input, cursor: null })).toEqual({
      failure: 'unavailable',
    })
  })

  it('says unavailable when the index stops answering in the middle of a walk', async () => {
    const { w, cursor } = await paged()
    w.index.faults.duringCandidates = async () => {
      w.index.faults.failing = 'unavailable'
    }
    const limits = { candidateBatch: 2 }
    expect(await w.search(NEEDLE, { limits, cursor })).toEqual({ failure: 'unavailable' })
  })

  it('keeps a cursor through a rebuild that is not adopted yet', async () => {
    const { w, cursor } = await paged()
    await w.index.beginRebuild(TENANT, 1)
    expect(await w.search(NEEDLE, { pageSize: 2, cursor })).toMatchObject({
      ok: { hits: [{ position: '3' }, { position: '2' }] },
    })
  })

  it('refuses the cursor of another query, and one whose tail names a session it never froze', async () => {
    const { w, cursor } = await paged()
    const other = queryOf({ content: literals(['needle']), modelReadable: 'only' })
    expect(await w.search(other, { cursor })).toEqual({ failure: 'cursor-stale' })
    const tail = { session: S2, through: '0', at: 0, position: '0' }
    const forged = { ...cursor, tail } as unknown as SearchCursor
    expect(await w.search(NEEDLE, { cursor: forged })).toEqual({ failure: 'cursor-stale' })
  })
})

describe('rule: what was not looked at is said', () => {
  function behind() {
    const w = world()
    const generation = w.index.ready()
    for (const session of [S1, S2, S3])
      for (let turn = 1; turn <= 4; turn += 1)
        w.log.commit(session, [said(`needle ${turn} `.padEnd(60, 'x'))], turn * 100)
    return { w, generation }
  }

  it('says the tails are not through when their budget is spent, and goes on from there', async () => {
    const { w, generation } = behind()
    await w.follow(generation, S1, '1')
    const limits = { scanBytes: 500, tailPageBytes: 200 }
    const first = await w.page(NEEDLE, { limits })
    expect(first.complete).toBe(false)
    expect(first.incomplete).toEqual({ reason: 'tail-budget', behind: 3, progress: null })
    expect(first.next?.tail?.session).toBe(S1)
    const pages = [first, ...(await w.pages(NEEDLE, { limits, cursor: first.next }))]
    expect(pages.filter(page => !page.complete).length).toBeGreaterThan(2)
    expect(pages.at(-1)).toMatchObject({ complete: true, next: null })
    const keys = keysOf(pages)
    expect([...keys].sort()).toEqual(w.scan(NEEDLE))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('counts the sessions still behind down as the tails are read', async () => {
    const { w } = behind()
    const limits = { scanBytes: 900, tailPageBytes: 200 }
    const pages = await w.pages(NEEDLE, { limits })
    const behindEach = pages.map(page => page.incomplete?.behind ?? 0)
    expect(behindEach[0]).toBe(3)
    expect(behindEach).toEqual([...behindEach].sort((left, right) => right - left))
    expect(behindEach.at(-1)).toBe(0)
  })

  it('says the index walk is not through when the candidates or the time run out', async () => {
    const { w, generation } = behind()
    await w.followAll(generation)
    const counted = await w.pages(NEEDLE, { limits: { maxCandidates: 5 } })
    expect(counted.map(page => page.incomplete?.reason ?? null)).toEqual(['budget', 'budget', null])
    expect(counted.map(page => page.hits.length)).toEqual([5, 5, 2])
    expect(counted[0]!.incomplete).toEqual({ reason: 'budget', behind: 0, progress: null })
    w.clock.step = 10
    const timed = await w.pages(NEEDLE, { limits: { timeBudgetMs: 40 } })
    expect(timed.length).toBeGreaterThan(2)
    expect(timed.slice(0, -1).every(page => page.incomplete?.reason === 'budget')).toBe(true)
    expect(keysOf(timed).sort()).toEqual(w.scan(NEEDLE))
  })

  it('counts a budget as spent when it is reached, not only when it is passed', async () => {
    const { w, generation } = behind()
    const one = await w.log.reader.entries({
      tenant: TENANT,
      session: S1,
      after: '0' as never,
      maxBytes: 200,
    })
    if ('failure' in one) throw new Error('read')
    w.log.reads.entries = 0
    const bytes = await w.page(NEEDLE, { limits: { scanBytes: one.ok.bytes, tailPageBytes: 200 } })
    expect(w.log.reads.entries).toBe(1)
    expect(bytes.incomplete?.reason).toBe('tail-budget')
    await w.followAll(generation)
    w.clock.step = 10
    const timed = await w.page(NEEDLE, { limits: { timeBudgetMs: 10 } })
    expect(timed.hits).toHaveLength(1)
    expect(timed.incomplete?.reason).toBe('budget')
  })

  it('gets somewhere on every page, however small the budgets: a search always ends', async () => {
    const { w, generation } = behind()
    await w.follow(generation, S1)
    await w.follow(generation, S2, '2')
    const limits = { timeBudgetMs: 0, scanBytes: 0, maxCandidates: 0, tailPageBytes: 1 }
    const pages = await w.pages(NEEDLE, { limits })
    expect(pages.length).toBeGreaterThanOrEqual(12)
    expect(keysOf(pages).sort()).toEqual(w.scan(NEEDLE))
    // One read of a tail, or one candidate; the page that ends the tails does both.
    expect(pages.slice(0, -1).every(page => !page.complete && page.hits.length <= 2)).toBe(true)
  })

  it('does not call a full page incomplete: there is a way on and nothing was skipped', async () => {
    const { w, generation } = behind()
    await w.follow(generation, S1)
    const pages = await w.pages(NEEDLE, { pageSize: 3 })
    expect(pages.every(page => page.complete)).toBe(true)
    expect(pages.slice(0, -1).every(page => page.hits.length === 3)).toBe(true)
    expect(keysOf(pages).sort()).toEqual(w.scan(NEEDLE))
  })

  it('goes on inside one commit: a page that ends in the middle of it loses nothing', async () => {
    const w = world()
    w.index.ready()
    w.log.commit(S1, [said('needle a'), said('needle b'), said('needle c')], 100)
    w.log.commit(S1, [said('needle d')], null)
    // Both commits come in one read, so the place to go on from is kept inside a page.
    const pages = await w.pages(NEEDLE, { pageSize: 1, limits: { tailPageBytes: 100_000 } })
    expect(w.log.reads.entries).toBe(5)
    expect(keysOf(pages)).toEqual(['session-1#1', 'session-1#2', 'session-1#3', 'session-1#4'])
    expect(pages[0]!.next?.tail).toEqual({ session: S1, through: '0', at: 0, position: '1' })
    expect(pages[2]!.next?.tail).toEqual({ session: S1, through: '0', at: 0, position: '3' })
    expect(pages[3]!.next?.tail).toEqual({ session: S1, through: '1', at: 100, position: '4' })
  })

  it('with more sessions behind than a cursor carries, says it cannot go on', async () => {
    const { w, generation } = behind()
    await w.follow(generation, S1)
    const carried = await w.page(NEEDLE, { pageSize: 3, limits: { maxFrozen: 2 } })
    expect(carried.complete).toBe(true)
    expect(carried.next?.frozen).toEqual([
      [S2, '0', 0],
      [S3, '0', 0],
    ])
    const cut = await w.page(NEEDLE, { pageSize: 3, limits: { maxFrozen: 1 } })
    expect(cut).toMatchObject({
      next: null,
      complete: false,
      incomplete: { reason: 'tail-budget', behind: 2 },
    })
    const walked = await w.page(NEEDLE, { pageSize: 9, limits: { maxFrozen: 1 } })
    expect(walked.hits).toHaveLength(9)
    expect(walked).toMatchObject({ next: null, incomplete: { reason: 'budget', behind: 0 } })
    const whole = await w.page(NEEDLE, { limits: { maxFrozen: 1 } })
    expect(whole).toMatchObject({ next: null, complete: true })
    expect(whole.hits).toHaveLength(12)
  })

  it('ends a page the tails filled with a way on into the index, or without one', async () => {
    const { w, generation } = behind()
    await w.follow(generation, S1)
    await w.follow(generation, S2)
    const filledByTail = await w.page(NEEDLE, { pageSize: 4 })
    expect(filledByTail).toMatchObject({ complete: true, next: { tail: { session: S3 } } })
    const spent = await w.page(NEEDLE, { limits: { scanBytes: 1 } })
    expect(spent.incomplete?.reason).toBe('tail-budget')
    const empty = queryOf({ content: literals(['needle 4']) })
    const w2 = world()
    w2.index.ready()
    w2.log.commit(S1, [said('needle 4')], 100)
    expect(await w2.page(empty, { pageSize: 1 })).toMatchObject({
      complete: true,
      next: { tail: { session: S1, position: '1' } },
    })
  })
})

describe('the cursor as data', () => {
  const cursor: SearchCursor = {
    query: queryDigest(NEEDLE),
    generation: 3,
    frozen: [[S1, '4' as never, 1000]],
    tail: { session: S1, through: '5' as never, at: 1000, position: '9' as never },
    before: '1048576001',
    last: { session: S2, position: '7' as never },
  }

  it('reads back what it wrote', () => {
    expect(parseCursor(JSON.parse(JSON.stringify(cursor)))).toEqual(cursor)
    const bare = { ...cursor, frozen: [], tail: null, before: null, last: null }
    expect(parseCursor(bare)).toEqual(bare)
    const zero = {
      ...cursor,
      generation: 0,
      frozen: [[S1, '0', 0]],
      tail: { session: S1, through: '0', at: 0, position: '0' },
    }
    expect(parseCursor(zero)).toEqual(zero)
  })

  it.each([
    ['not an object', 'cursor'],
    ['null', null],
    ['nothing', undefined],
    ['no query', { ...cursor, query: '' }],
    ['a generation that is no count', { ...cursor, generation: -1 }],
    ['a generation that is text', { ...cursor, generation: '3' }],
    ['frozen that is no list', { ...cursor, frozen: {} }],
    ['a frozen cover with a revision that is no number', { ...cursor, frozen: [[S1, 'x', 0]] }],
    ['a frozen cover with no time', { ...cursor, frozen: [[S1, '4']] }],
    ['a frozen cover that is no triple', { ...cursor, frozen: ['x'] }],
    ['a frozen cover with no session', { ...cursor, frozen: [['', '4', 0]] }],
    ['a tail with no session', { ...cursor, tail: { ...cursor.tail, session: 7 } }],
    ['a tail with a bad revision', { ...cursor, tail: { ...cursor.tail, through: '-1' } }],
    ['a tail with a bad time', { ...cursor, tail: { ...cursor.tail, at: 1.5 } }],
    ['a tail with a bad position', { ...cursor, tail: { ...cursor.tail, position: '' } }],
    ['a tail that is no object', { ...cursor, tail: 5 }],
    ['a document number that is no number', { ...cursor, before: '12a' }],
    ['a document number that is not text', { ...cursor, before: 12 }],
    ['a last hit with no position', { ...cursor, last: { session: S2 } }],
    ['a last hit that is no object', { ...cursor, last: 'x' }],
    ['a missing field', { query: cursor.query, generation: 3, frozen: [] }],
  ])('refuses %s', (_name, value) => {
    expect(parseCursor(value)).toBeNull()
  })

  it('gives one digest to one query however its sets are ordered, and another to another', () => {
    const base = queryOf({
      content: literals(['a', 'b']),
      kinds: ['message.user', 'message.assistant'],
      scope: { kind: 'sessions', sessions: [S1, S2] },
    })
    const reordered = {
      ...base,
      kinds: ['message.assistant', 'message.user'] as const,
      scope: { kind: 'sessions' as const, sessions: [S2, S1] },
    }
    expect(queryDigest(reordered)).toBe(queryDigest(base))
    const others = [
      { ...base, content: literals(['b', 'a']) },
      { ...base, content: literals(['a', 'b'], true) },
      { ...base, content: { kind: 'regex' as const, pattern: 'a', caseSensitive: false } },
      { ...base, kinds: ['message.user'] as const },
      { ...base, scope: { kind: 'tenant' as const } },
      { ...base, scope: { kind: 'sessions' as const, sessions: [S1] } },
      { ...base, content: { kind: 'regex' as const, pattern: 'b', caseSensitive: false } },
      { ...base, content: { kind: 'regex' as const, pattern: 'a', caseSensitive: true } },
      { ...base, archived: 'archived' as const },
      { ...base, from: 1 },
      { ...base, to: 1 },
      { ...base, modelReadable: 'only' as const },
    ]
    const digests = new Set([base, ...others].map(queryDigest))
    expect(digests.size).toBe(others.length + 1)
    expect(queryDigest(base)).toMatch(/^[0-9a-f]{64}$/u)
  })
})
