import { describe, expect, it } from 'vitest'
import { queryDigest, type SearchCursor } from '../src/index.ts'
import { literals, queryOf } from './support.ts'
import { S1, S2, S3, TENANT, keysOf, said, world } from './search-support.ts'

const NEEDLE = queryOf({ content: literals(['needle']) })

/** Three sessions, eight commits, six of them say the needle. */
function filled() {
  const w = world()
  w.log.commit(S1, [said('needle one')], 1000)
  w.log.commit(S1, [said('nothing here')], 1100)
  w.log.commit(S1, [said('needle two', 'message.assistant')], 1200)
  w.log.commit(S2, [said('needle three')], 1050)
  w.log.commit(S2, [said('needle four'), said('needle five', 'message.assistant')], 1300)
  w.log.commit(S3, [said('haystack')], 900)
  w.log.commit(S3, [said('needle six')], 1400)
  w.log.commit(S3, [said('needle delivered', 'message.delivered')], 1500)
  return w
}
const ALL = [
  'session-1#1',
  'session-1#3',
  'session-2#1',
  'session-2#2',
  'session-2#3',
  'session-3#2',
]
const foreign = (generation: number): SearchCursor => ({
  query: queryDigest(NEEDLE),
  generation,
  frozen: [],
  tail: null,
  before: null,
  last: null,
})

describe('a search in each state of the index (SH-1, SH-3)', () => {
  it('has no index: reads every log and says it is through', async () => {
    const w = filled()
    const page = await w.page(NEEDLE)
    expect(keysOf([page]).sort()).toEqual(ALL)
    expect(page).toMatchObject({ complete: true, incomplete: null, next: null })
    expect(w.index.reads.candidates).toBe(0)
  })

  it('has no index and not the budget to read every log: says so, with no way on', async () => {
    const w = filled()
    const page = await w.page(NEEDLE, { limits: { scanBytes: 1, tailPageBytes: 1 } })
    expect(page.complete).toBe(false)
    expect(page.next).toBeNull()
    expect(page.incomplete).toEqual({
      reason: 'rebuilding',
      behind: 3,
      progress: { indexed: 0, total: 3 },
    })
    expect(keysOf([page])).toEqual(['session-1#1'])
  })

  it('has no index and a full page: cannot go on, so it is not through', async () => {
    const w = filled()
    const page = await w.page(NEEDLE, { pageSize: 2 })
    expect(page.hits).toHaveLength(2)
    expect(page).toMatchObject({ complete: false, next: null })
    expect(page.incomplete?.reason).toBe('rebuilding')
  })

  it('refuses a cursor when there is no generation it could belong to', async () => {
    const w = filled()
    expect(await w.search(NEEDLE, { cursor: foreign(1) })).toEqual({ failure: 'cursor-stale' })
  })

  it('has an index that covers everything: asks the index and reads no tail', async () => {
    const w = filled()
    await w.followAll(w.index.ready())
    w.log.reads.entries = 0
    const page = await w.page(NEEDLE)
    expect(keysOf([page])).toEqual([
      'session-3#2',
      'session-2#3',
      'session-2#2',
      'session-1#3',
      'session-2#1',
      'session-1#1',
    ])
    expect(page).toMatchObject({ complete: true, incomplete: null, next: null })
    expect(w.log.reads.entries).toBe(0)
  })

  it('goes on from a cursor: every hit once, newest first, then no way on', async () => {
    const w = filled()
    await w.followAll(w.index.ready())
    const pages = await w.pages(NEEDLE, { pageSize: 2 })
    expect(pages.map(page => page.hits.length)).toEqual([2, 2, 2, 0])
    expect(pages.every(page => page.complete)).toBe(true)
    expect(keysOf(pages)).toEqual([
      'session-3#2',
      'session-2#3',
      'session-2#2',
      'session-1#3',
      'session-2#1',
      'session-1#1',
    ])
  })

  it('is being rebuilt with an earlier generation at hand: searches that one', async () => {
    const w = filled()
    await w.followAll(w.index.ready())
    await w.index.beginRebuild(TENANT, 3)
    w.log.reads.entries = 0
    const page = await w.page(NEEDLE)
    expect(keysOf([page]).sort()).toEqual(ALL)
    expect(page.complete).toBe(true)
    expect(w.log.reads.entries).toBe(0)
  })

  it('is being built for the first time: reads the logs, and says how far the build is', async () => {
    const w = filled()
    const begun = await w.index.beginRebuild(TENANT, 3)
    if ('failure' in begun) throw new Error('begin')
    await w.follow(begun.ok.generation, S1)
    const whole = await w.page(NEEDLE)
    expect(keysOf([whole]).sort()).toEqual(ALL)
    expect(whole).toMatchObject({ complete: true, next: null })
    const short = await w.page(NEEDLE, { limits: { scanBytes: 1, tailPageBytes: 1 } })
    expect(short.incomplete).toEqual({
      reason: 'rebuilding',
      behind: 3,
      progress: { indexed: 1, total: 3 },
    })
  })

  it('is broken: says so for a search and for a cursor, never "no hits"', async () => {
    const w = filled()
    const generation = w.index.ready()
    w.index.faults.broken = true
    expect(await w.search(NEEDLE)).toEqual({ failure: 'index-broken' })
    expect(await w.search(NEEDLE, { cursor: foreign(generation) })).toEqual({
      failure: 'index-broken',
    })
  })

  it('finds a cover past the head of its log: the index is not of this log', async () => {
    const w = filled()
    const generation = w.index.ready()
    await w.index.append({
      tenant: TENANT,
      generation,
      session: S1,
      through: '99' as never,
      at: 0,
      documents: [],
    })
    expect(await w.search(NEEDLE)).toEqual({ failure: 'index-broken' })
  })

  it('cannot reach the index or the log: unavailable, not empty', async () => {
    const w = filled()
    await w.followAll(w.index.ready())
    w.index.faults.failing = 'unavailable'
    expect(await w.search(NEEDLE)).toEqual({ failure: 'unavailable' })
    w.index.faults.failing = null
    w.log.faults.sessions = true
    expect(await w.search(NEEDLE)).toEqual({ failure: 'unavailable' })
  })

  it('cannot read a candidate back, or a tail: unavailable', async () => {
    const w = filled()
    await w.followAll(w.index.ready())
    w.log.faults.points = true
    expect(await w.search(NEEDLE)).toEqual({ failure: 'unavailable' })
    w.log.faults.points = false
    w.log.faults.entries = true
    expect(await w.search(NEEDLE)).toMatchObject({ ok: { complete: true } })
    w.log.commit(S1, [said('needle late')], 2000)
    expect(await w.search(NEEDLE)).toEqual({ failure: 'unavailable' })
  })
})

describe('what was just written (SH-2)', () => {
  it('is found at once, first, while the follower stands still', async () => {
    const w = filled()
    await w.followAll(w.index.ready())
    w.log.commit(S2, [said('needle fresh')], 5000)
    w.log.commit('session-new' as never, [said('a needle in a new session')], 5100)
    const page = await w.page(NEEDLE)
    expect(keysOf([page]).slice(0, 2)).toEqual(['session-new#1', 'session-2#4'])
    expect(keysOf([page]).sort()).toEqual([...ALL, 'session-2#4', 'session-new#1'].sort())
    expect(page.complete).toBe(true)
  })

  it('is reported once when the follower catches up between two pages', async () => {
    const w = filled()
    const generation = w.index.ready()
    await w.followAll(generation)
    w.log.commit(S1, [said('needle fresh a'), said('needle fresh b')], 5000)
    w.log.commit(S1, [said('needle fresh c')], 5100)
    const pages = await w.pages(NEEDLE, { pageSize: 1 }, () => w.followAll(generation))
    const keys = keysOf(pages)
    expect(new Set(keys).size).toBe(keys.length)
    expect([...keys].sort()).toEqual(w.scan(NEEDLE))
    expect(pages.every(page => page.complete)).toBe(true)
  })
})

describe('one message, one hit (SH-6)', () => {
  const both = {
    kind: 'message.assistant',
    blocks: [{ text: 'needle shown' }, { text: 'needle hidden', toModel: false }],
  }

  it('reports an entry with two index documents once, in a page and across pages', async () => {
    const w = world()
    w.log.commit(S1, [both], 1000)
    w.log.commit(S1, [both], 1100)
    await w.followAll(w.index.ready())
    expect(keysOf([await w.page(NEEDLE)])).toEqual(['session-1#2', 'session-1#1'])
    const pages = await w.pages(NEEDLE, { pageSize: 1 })
    expect(keysOf(pages)).toEqual(['session-1#2', 'session-1#1'])
  })

  it('carries the session, the position, the kind, the time and a snippet', async () => {
    const w = world()
    w.log.commit(S1, [said('before the needle after', 'message.assistant')], 1234)
    w.log.commit(S1, [said('a needle with no time')], null)
    await w.follow(w.index.ready(), S1, '1')
    const { hits } = await w.page(NEEDLE, { limits: {} })
    expect(hits).toEqual([
      {
        session: S1,
        position: '2',
        kind: 'message.user',
        at: null,
        snippet: { before: 'a ', match: 'needle', after: ' with no time' },
      },
      {
        session: S1,
        position: '1',
        kind: 'message.assistant',
        at: 1234,
        snippet: { before: 'before the ', match: 'needle', after: ' after' },
      },
    ])
  })
})

describe('the range of a search', () => {
  it('keeps to the named sessions, in the index and in the tails', async () => {
    const w = filled()
    await w.follow(w.index.ready(), S1)
    const query = queryOf({
      content: literals(['needle']),
      scope: { kind: 'sessions', sessions: [S1, S3] },
    })
    const page = await w.page(query)
    expect(keysOf([page]).sort()).toEqual(['session-1#1', 'session-1#3', 'session-3#2'])
  })

  it('keeps to archived or unarchived sessions as asked', async () => {
    const w = filled()
    await w.follow(w.index.ready(), S1)
    w.log.archive(S1, true)
    w.log.archive(S3, true)
    const archived = await w.page(queryOf({ content: literals(['needle']), archived: 'archived' }))
    expect(keysOf([archived]).sort()).toEqual(['session-1#1', 'session-1#3', 'session-3#2'])
    const open = await w.page(queryOf({ content: literals(['needle']), archived: 'unarchived' }))
    expect(keysOf([open]).sort()).toEqual(['session-2#1', 'session-2#2', 'session-2#3'])
  })

  it('counts an entry with no recorded time at the last one before it, tail and index alike', async () => {
    const w = world()
    w.log.commit(S1, [said('needle early')], 1000)
    w.log.commit(S1, [said('needle untimed')], null)
    w.log.commit(S1, [said('needle late')], 3000)
    w.log.commit(S1, [said('needle untimed late')], null)
    const query = queryOf({ content: literals(['needle']), from: 900, to: 1500 })
    const generation = w.index.ready()
    expect(keysOf([await w.page(query)]).sort()).toEqual(['session-1#1', 'session-1#2'])
    await w.follow(generation, S1, '1')
    expect(keysOf([await w.page(query)]).sort()).toEqual(['session-1#1', 'session-1#2'])
    await w.follow(generation, S1)
    expect(keysOf([await w.page(query)]).sort()).toEqual(['session-1#1', 'session-1#2'])
    const late = queryOf({ content: literals(['needle']), from: 2000, to: null })
    expect(keysOf([await w.page(late)]).sort()).toEqual(['session-1#3', 'session-1#4'])
  })

  it('drops a candidate the log does not bear out', async () => {
    const w = filled()
    const generation = w.index.ready()
    await w.followAll(generation)
    const document = { visibility: 'model' as const, text: 'needle', markers: ['\u0002ku'] }
    await w.index.append({
      tenant: TENANT,
      generation,
      session: S1,
      through: '3' as never,
      at: 9000,
      documents: [],
    })
    w.log.commit('session-ghost' as never, [said('haystack')], 100)
    await w.index.append({
      tenant: TENANT,
      generation,
      session: 'session-ghost' as never,
      through: '1' as never,
      at: 9000,
      documents: [
        { position: '1' as never, revision: '1' as never, at: 9000, document },
        { position: '7' as never, revision: '1' as never, at: 9000, document },
      ],
    })
    const page = await w.page(NEEDLE)
    expect(keysOf([page]).sort()).toEqual(ALL)
    expect(page.complete).toBe(true)
  })
})
