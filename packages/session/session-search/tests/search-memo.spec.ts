import { describe, expect, it } from 'vitest'
import type { SessionId } from '@omne-harness/session-contract'
import { testingTenant } from '@omne-harness/session-contract/testing'
import { compileQuery, queryDigest, searchHistory, type SearchQuery } from '../src/index.ts'
import { keysOf, ROOMY, S1, S2, said, TENANT, world } from './search-support.ts'
import { LIMITS, queryOf } from './support.ts'

// A page reads the covers of the index and the heads of the logs. Both only move on, so a stamp of
// each says whether they moved; what did not move is not read again.

const NEEDLE: SearchQuery = queryOf({
  content: { kind: 'literals', all: ['needle'], caseSensitive: false },
})

function settled() {
  const w = world()
  w.log.commit(S1, [said('a needle here'), said('nothing')], 1000)
  w.log.commit(S2, [said('another needle')], 2000)
  return w
}

describe('what a page reads again', () => {
  it('reads the covers and the session list once: an unchanged tenant is asked for neither again', async () => {
    const w = settled()
    await w.followAll(w.index.ready())
    const first = await w.page(NEEDLE)
    expect(keysOf([first])).toEqual([`${S2}#1`, `${S1}#1`])
    expect({ covers: w.index.reads.covers, lists: w.log.reads.sessions }).toEqual({
      covers: 1,
      lists: 1,
    })
    for (let turn = 0; turn < 3; turn += 1) expect(await w.page(NEEDLE)).toEqual(first)
    expect({ covers: w.index.reads.covers, lists: w.log.reads.sessions }).toEqual({
      covers: 1,
      lists: 1,
    })
    expect(w.log.reads.stamps).toBe(4)
  })

  it('reads the session list again after a commit, and finds what was just written (SH-1)', async () => {
    const w = settled()
    await w.followAll(w.index.ready())
    await w.page(NEEDLE)
    w.log.commit(S1, [said('a late needle')], 3000)
    const page = await w.page(NEEDLE)
    expect(page.complete).toBe(true)
    expect(keysOf([page])).toEqual([`${S1}#3`, `${S2}#1`, `${S1}#1`])
    expect(w.log.reads.sessions).toBe(2)
    expect(w.index.reads.covers).toBe(1)
  })

  it('reads the list again for a session that appeared since', async () => {
    const w = settled()
    await w.followAll(w.index.ready())
    await w.page(NEEDLE)
    const fresh = 'session-fresh' as SessionId
    w.log.commit(fresh, [said('a fresh needle')], 4000)
    expect(keysOf([await w.page(NEEDLE)])).toEqual([`${fresh}#1`, `${S2}#1`, `${S1}#1`])
  })

  it('gets the covers again once the index moved on, and gives each entry once', async () => {
    const w = settled()
    const generation = w.index.ready()
    await w.followAll(generation)
    await w.page(NEEDLE)
    w.log.commit(S1, [said('a late needle')], 3000)
    await w.followAll(generation)
    const page = await w.page(NEEDLE)
    expect(keysOf([page])).toEqual([`${S1}#3`, `${S2}#1`, `${S1}#1`])
    expect(w.index.reads.covers).toBe(2)
    // Nothing is behind the index now: the page read no tail.
    const tails = w.log.reads.entries
    await w.page(NEEDLE)
    expect(w.log.reads.entries).toBe(tails)
  })

  it('remembers what the index gave last when only the index moved since the page before', async () => {
    const w = settled()
    const generation = w.index.ready()
    await w.followAll(generation)
    w.log.commit(S1, [said('a late needle')], 3000)
    await w.page(NEEDLE)
    // The follower catches up: the covers move and the logs stand still.
    await w.followAll(generation)
    await w.page(NEEDLE)
    const covers = w.index.reads.covers
    await w.page(NEEDLE)
    expect(w.index.reads.covers).toBe(covers)
  })

  it('sees a session archived since, though nothing was written to its log', async () => {
    const w = settled()
    await w.followAll(w.index.ready())
    const unarchived: SearchQuery = { ...NEEDLE, archived: 'unarchived' }
    expect(keysOf([await w.page(unarchived)])).toEqual([`${S2}#1`, `${S1}#1`])
    w.log.archive(S2, true)
    expect(keysOf([await w.page(unarchived)])).toEqual([`${S1}#1`])
    w.log.archive(S2, false)
    expect(keysOf([await w.page(unarchived)])).toEqual([`${S2}#1`, `${S1}#1`])
  })

  it('does not carry the covers of one generation to the next', async () => {
    const w = settled()
    await w.followAll(w.index.ready())
    await w.page(NEEDLE)
    const begun = await w.index.beginRebuild(TENANT, 2)
    if ('failure' in begun) throw new Error('begin')
    // The new generation covers the first session only; the second is read from its log.
    await w.follow(begun.ok.generation, S1)
    await w.index.adopt(TENANT, begun.ok.generation)
    const page = await w.page(NEEDLE)
    expect(page.complete).toBe(true)
    expect(keysOf([page]).sort()).toEqual([`${S1}#1`, `${S2}#1`])
    expect(w.index.reads.covers).toBe(2)
    // The new generation is what is remembered now: the next page reads no covers.
    await w.page(NEEDLE)
    expect(w.index.reads.covers).toBe(2)
  })

  it('keeps what it knows of one tenant apart from another', async () => {
    const w = settled()
    await w.followAll(w.index.ready())
    await w.page(NEEDLE)
    const other = testingTenant('org_h1st0rysearch0000000000001', 'acc_h1st0rysearch0000000000001')
    const compiled = compileQuery(NEEDLE, LIMITS)
    if (typeof compiled === 'string') throw new Error(compiled)
    await searchHistory(w.deps, {
      tenant: other,
      query: compiled,
      digest: queryDigest(NEEDLE),
      cursor: null,
      pageSize: 10,
      limits: ROOMY,
    })
    // The other tenant knew nothing: it was given the covers and the list, not the first one's.
    expect({ covers: w.index.reads.covers, lists: w.log.reads.sessions }).toEqual({
      covers: 2,
      lists: 2,
    })
  })

  it('answers unavailable when the stamp of the logs cannot be read', async () => {
    const w = settled()
    await w.followAll(w.index.ready())
    await w.page(NEEDLE)
    w.log.faults.stamps = true
    expect(await w.search(NEEDLE)).toEqual({ failure: 'unavailable' })
  })

  it('later batches of a page ask for no covers again', async () => {
    const w = world()
    for (let n = 1; n <= 12; n += 1) w.log.commit(S1, [said(`needle ${String(n)}`)], 1000 + n)
    await w.followAll(w.index.ready())
    const page = await w.page(NEEDLE)
    expect(page.hits).toHaveLength(12)
    expect(w.index.reads.candidates).toBeGreaterThan(2)
    expect(w.index.reads.covers).toBe(1)
  })
})
