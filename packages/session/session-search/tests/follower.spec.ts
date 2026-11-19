import { describe, expect, it } from 'vitest'
import { createHistoryFollower, followTenant } from '../src/index.ts'
import { literals, queryOf } from './support.ts'
import { S1, S2, S3, TENANT, keysOf, said, world } from './search-support.ts'

const NEEDLE = queryOf({ content: literals(['needle']) })
const LIMITS = { pageBytes: 1 << 20, maxSteps: 100 }

function logged() {
  const w = world()
  for (const session of [S1, S2, S3])
    for (let turn = 1; turn <= 3; turn += 1) w.log.commit(session, [said(`needle ${turn}`)], turn)
  const pass = (limits = LIMITS) =>
    followTenant({ index: w.index, log: w.log.reader }, TENANT, limits)
  return { w, pass }
}

describe('following the logs of a tenant (SH-2, SH-3)', () => {
  it('with no index: begins a build, follows every log, and adopts it when nothing is behind', async () => {
    const { w, pass } = logged()
    expect(await pass()).toEqual({ ok: { behind: 0, steps: 3, adopted: true } })
    expect(await w.index.state(TENANT)).toEqual({ kind: 'ready', generation: 1 })
    w.log.reads.entries = 0
    const page = await w.page(NEEDLE)
    expect(page.complete).toBe(true)
    expect(keysOf([page])).toHaveLength(9)
    expect(w.log.reads.entries).toBe(0)
  })

  it('with a ready index: appends what was committed since, and then has nothing to do', async () => {
    const { w, pass } = logged()
    await pass()
    w.log.commit(S2, [said('needle late')], 50)
    expect(await pass()).toEqual({ ok: { behind: 0, steps: 1, adopted: false } })
    expect(w.index.coverOf(1, S2)).toEqual({ through: '4', at: 50 })
    expect(await pass()).toEqual({ ok: { behind: 0, steps: 0, adopted: false } })
  })

  it('rests off the log after each read for as long as the read took, times the ratio it is given', async () => {
    const { w } = logged()
    const clock = { at: 0 }
    const rests: number[] = []
    const extract = w.log.reader.extract.bind(w.log.reader)
    w.log.reader.extract = async input => {
      clock.at += 7
      return extract(input)
    }
    const rest = { ratio: 2, now: () => clock.at, sleep: async (ms: number) => void rests.push(ms) }
    const deps = { index: w.index, log: w.log.reader }
    expect(await followTenant(deps, TENANT, { pageBytes: 1, maxSteps: 100, rest })).toMatchObject({
      ok: { behind: 0, steps: 9, adopted: true },
    })
    // Nine reads: the follower stays off the log between them, not after the last one.
    expect(rests).toEqual(Array.from({ length: 8 }, () => 14))
  })

  it('stops after its steps and says how many sessions are still behind; a build waits for them', async () => {
    const { w, pass } = logged()
    const small = { pageBytes: 1, maxSteps: 4 }
    expect(await pass(small)).toEqual({ ok: { behind: 2, steps: 4, adopted: false } })
    expect(await w.index.state(TENANT)).toMatchObject({ kind: 'rebuilding', generation: null })
    w.log.commit(S1, [said('needle while building')], 60)
    expect(await pass(small)).toEqual({ ok: { behind: 1, steps: 4, adopted: false } })
    expect(await pass(small)).toEqual({ ok: { behind: 0, steps: 2, adopted: true } })
    expect(keysOf([await w.page(NEEDLE)])).toHaveLength(10)
  })

  it('while a rebuild is on: writes to the new generation, leaves the old one as it was', async () => {
    const { w, pass } = logged()
    await pass()
    await w.index.beginRebuild(TENANT, 3)
    w.log.commit(S3, [said('needle during rebuild')], 70)
    expect(await pass({ pageBytes: 1 << 20, maxSteps: 2 })).toEqual({
      ok: { behind: 1, steps: 2, adopted: false },
    })
    expect(w.index.coverOf(1, S3)).toEqual({ through: '3', at: 3 })
    expect(w.index.coverOf(2, S1)).toEqual({ through: '3', at: 3 })
    expect(keysOf([await w.page(NEEDLE)])).toHaveLength(10)
    expect(await pass()).toEqual({ ok: { behind: 0, steps: 1, adopted: true } })
    expect(await w.index.state(TENANT)).toEqual({ kind: 'ready', generation: 2 })
  })

  it('with a broken index: builds a new generation and puts it in place', async () => {
    const { w, pass } = logged()
    await pass()
    w.index.faults.broken = true
    expect(await w.search(NEEDLE)).toEqual({ failure: 'index-broken' })
    expect(await pass()).toEqual({ ok: { behind: 0, steps: 3, adopted: true } })
    expect(await w.index.state(TENANT)).toEqual({ kind: 'ready', generation: 2 })
    expect(keysOf([await w.page(NEEDLE)])).toHaveLength(9)
  })

  it('says unavailable when the log or the index does not answer, and adopts nothing', async () => {
    const { w, pass } = logged()
    w.log.faults.sessions = true
    expect(await pass()).toEqual({ failure: 'unavailable' })
    w.log.faults.sessions = false
    w.log.faults.entries = true
    expect(await pass()).toEqual({ failure: 'unavailable' })
    w.log.faults.entries = false
    w.index.faults.failing = 'unavailable'
    expect(await pass()).toEqual({ failure: 'unavailable' })
    w.index.faults.failing = null
    expect(await w.index.state(TENANT)).toMatchObject({ kind: 'rebuilding' })
    const adopt = w.index.adopt.bind(w.index)
    w.index.adopt = async () => ({ failure: 'unavailable' })
    expect(await pass()).toEqual({ failure: 'unavailable' })
    w.index.adopt = adopt
    expect(await pass()).toMatchObject({ ok: { adopted: true } })
  })

  it('says unavailable when a build cannot be begun', async () => {
    const { w, pass } = logged()
    w.index.beginRebuild = async () => ({ failure: 'unavailable' })
    expect(await pass()).toEqual({ failure: 'unavailable' })
    expect(await w.index.state(TENANT)).toEqual({ kind: 'absent' })
  })
})

describe('reading ahead while appending', () => {
  it('reads the next page while this one is appended, one read at a time, and none past its steps', async () => {
    const { w, pass } = logged()
    const order: string[] = []
    let reading = 0
    let most = 0
    const entries = w.log.reader.extract.bind(w.log.reader)
    w.log.reader.extract = async input => {
      reading += 1
      most = Math.max(most, reading)
      order.push('read')
      const page = await entries(input)
      await new Promise(resolve => setTimeout(resolve, 2))
      reading -= 1
      return page
    }
    const append = w.index.append.bind(w.index)
    w.index.append = async input => {
      order.push('append')
      await new Promise(resolve => setTimeout(resolve, 6))
      const done = await append(input)
      order.push('appended')
      return done
    }
    expect(await pass({ pageBytes: 1, maxSteps: 3 })).toEqual({
      ok: { behind: 2, steps: 3, adopted: false },
    })
    // The second read starts before the first append is done; the last step reads nothing more.
    expect(order).toEqual([
      'read',
      'read',
      'append',
      'appended',
      'read',
      'append',
      'appended',
      'append',
      'appended',
    ])
    expect(most).toBe(1)
    expect(w.index.coverOf(1, S1)).toEqual({ through: '3', at: 3 })
  })
})

describe('the follower of a process (SH-2, SH-4)', () => {
  function following(over: { intervalMs?: number; maxSteps?: number } = {}) {
    const { w } = logged()
    const reports: string[] = []
    const compacted: number[] = []
    w.index.compact = async (_tenant, pages) => void compacted.push(pages)
    const follower = createHistoryFollower({
      index: w.index,
      log: w.log.reader,
      limits: { pageBytes: 1, maxSteps: over.maxSteps ?? 2 },
      intervalMs: over.intervalMs ?? 60_000,
      compactPages: 7,
      report: diagnostic => reports.push(diagnostic),
    })
    return { w, follower, reports, compacted }
  }

  it('on a poke when nothing moved: reads the stamp of the logs, no list and no covers', async () => {
    const { w, follower, reports } = following()
    follower.poke(TENANT)
    await follower.idle()
    const read = () => ({ lists: w.log.reads.sessions, covers: w.index.reads.listed })
    const settled = read()
    const stamps = w.log.reads.stamps
    for (let turn = 0; turn < 3; turn += 1) {
      follower.poke(TENANT)
      await follower.idle()
    }
    expect(read()).toEqual(settled)
    expect(w.log.reads.stamps).toBe(stamps + 3)
    // A commit moves the stamp: the next wake-up follows the log again.
    w.log.commit(S1, [said('needle late')], 99)
    follower.poke(TENANT)
    await follower.idle()
    expect(w.log.reads.sessions).toBeGreaterThan(settled.lists)
    expect(w.index.coverOf(1, S1).through).toBe('4')
    expect(reports).toEqual([])
    follower.stop()
  })

  it('follows again when the index changed under it, though the logs did not move', async () => {
    const { w, follower } = following()
    follower.poke(TENANT)
    await follower.idle()
    expect(await w.index.state(TENANT)).toEqual({ kind: 'ready', generation: 1 })
    // A rebuild begun by someone else: the generation being built is behind every log.
    await w.index.beginRebuild(TENANT, 3)
    follower.poke(TENANT)
    await follower.idle()
    expect(await w.index.state(TENANT)).toEqual({ kind: 'ready', generation: 2 })
    expect(w.index.coverOf(2, S3).through).toBe('3')
    follower.stop()
  })

  it('does not take a pass that left sessions behind, or failed, for a settled one', async () => {
    const { w, follower } = following({ maxSteps: 1 })
    w.log.faults.entries = true
    follower.poke(TENANT)
    await follower.idle()
    w.log.faults.entries = false
    const lists = w.log.reads.sessions
    follower.poke(TENANT)
    await follower.idle()
    expect(w.log.reads.sessions).toBeGreaterThan(lists)
    expect(await w.index.state(TENANT)).toEqual({ kind: 'ready', generation: 1 })
    follower.stop()
  })

  it('on a poke: goes pass after pass until nothing is behind, compacting as it goes', async () => {
    const { w, follower, compacted, reports } = following()
    follower.poke(TENANT)
    follower.poke(TENANT)
    await follower.idle()
    expect(await w.index.state(TENANT)).toEqual({ kind: 'ready', generation: 1 })
    expect(compacted.length).toBeGreaterThanOrEqual(5)
    expect(new Set(compacted)).toEqual(new Set([7]))
    expect(reports).toEqual([])
    w.log.commit(S1, [said('needle after')], 90)
    follower.poke(TENANT)
    await follower.idle()
    expect(w.index.coverOf(1, S1).through).toBe('4')
    // A pass that appended nothing has nothing to compact.
    const before = compacted.length
    follower.poke(TENANT)
    await follower.idle()
    expect(compacted).toHaveLength(before)
    follower.stop()
  })

  it('runs one pass of a tenant at a time, however often it is poked', async () => {
    const { w, follower } = following({ maxSteps: 1 })
    const sessions = w.log.reader.sessions.bind(w.log.reader)
    let inFlight = 0
    let most = 0
    w.log.reader.sessions = async tenant => {
      inFlight += 1
      most = Math.max(most, inFlight)
      await new Promise(resolve => setTimeout(resolve, 2))
      inFlight -= 1
      return sessions(tenant)
    }
    for (let turn = 0; turn < 5; turn += 1) {
      follower.poke(TENANT)
      await new Promise(resolve => setTimeout(resolve, 1))
    }
    await follower.idle()
    expect(most).toBe(1)
    expect(await w.index.state(TENANT)).toMatchObject({ kind: 'ready' })
    follower.stop()
  })

  it('a poke that comes during a pass is not lost: one more pass follows', async () => {
    const { w, follower } = following({ maxSteps: 100 })
    follower.poke(TENANT)
    w.log.commit(S2, [said('needle racing')], 91)
    follower.poke(TENANT)
    await follower.idle()
    expect(w.index.coverOf(1, S2).through).toBe('4')
    follower.stop()
  })

  it('reports a pass that failed and tries again at the next poke', async () => {
    const { w, follower, reports } = following()
    w.log.faults.sessions = true
    follower.poke(TENANT)
    await follower.idle()
    expect(reports).toEqual(['following the history failed: unavailable'])
    w.log.faults.sessions = false
    const sessions = w.log.reader.sessions.bind(w.log.reader)
    w.log.reader.sessions = () => Promise.reject(new Error('the port broke'))
    follower.poke(TENANT)
    await follower.idle()
    expect(reports[1]).toBe('following the history failed: Error: the port broke')
    w.log.reader.sessions = sessions
    follower.poke(TENANT)
    await follower.idle()
    expect(await w.index.state(TENANT)).toMatchObject({ kind: 'ready' })
    follower.stop()
  })

  it('looks again at the tenants it knows on its interval, and no more once stopped', async () => {
    const { w, follower } = following({ intervalMs: 5, maxSteps: 100 })
    follower.poke(TENANT)
    await follower.idle()
    w.log.commit(S3, [said('needle with no wake-up')], 92)
    await new Promise(resolve => setTimeout(resolve, 40))
    await follower.idle()
    expect(w.index.coverOf(1, S3).through).toBe('4')
    follower.stop()
    w.log.commit(S3, [said('needle after the stop')], 93)
    follower.poke(TENANT)
    await new Promise(resolve => setTimeout(resolve, 20))
    await follower.idle()
    expect(w.index.coverOf(1, S3).through).toBe('4')
  })
})
