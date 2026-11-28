import { describe, expect, it, vi } from 'vitest'
import { FLOOR_KEY, SETTLE_AFTER_MS, storedFloor, whenDrawn } from '../src/page/shell/floor.ts'

const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const BOB = '{"organization":"org_1","account":"acc_bob"}'
const X1 = 'plugin:x@v1'
const X2 = 'plugin:x@v2'

function machine() {
  const kept = new Map<string, string>()
  const store = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
  }
  /** One run of the page: what waits to settle is run by hand, as the time passing would. */
  const start = () => {
    const waiting = new Set<() => void>()
    const floor = storedFloor(
      () => store,
      run => {
        waiting.add(run)
        return () => void waiting.delete(run)
      },
    )
    const pass = (): void => {
      for (const run of waiting) {
        waiting.delete(run)
        run()
      }
    }
    return { floor, pass, waiting }
  }
  const strikes = (tenant = ALICE): number =>
    (JSON.parse(kept.get(`${FLOOR_KEY}:${tenant}`) ?? '{"strikes":0}') as { strikes: number })
      .strikes
  /** A run that loads what it had and stays up. */
  const good = (...fibers: string[]) => {
    const run = start()
    const risen = run.floor.rise(ALICE)
    for (const fiber of fibers) run.floor.want(ALICE, fiber)
    run.floor.settle(ALICE)
    run.pass()
    return risen
  }
  /** A run that goes down while what it wanted was being loaded. */
  const dying = (...fibers: string[]) => {
    const run = start()
    const risen = run.floor.rise(ALICE)
    for (const fiber of fibers) run.floor.want(ALICE, fiber)
    return risen
  }
  return { kept, store, start, strikes, good, dying }
}

describe('the floor of the page', () => {
  it('holds nothing back on the first start, and remembers what was wanted', () => {
    const m = machine()
    expect(m.good(X1)).toEqual({ want: [], held: false })
    expect(m.good()).toEqual({ want: [X1], held: false })
  })

  it('never holds back a page that keeps coming up, however often it is started', () => {
    const m = machine()
    for (let round = 0; round < 6; round += 1) expect(m.good(X1).held).toBe(false)
    expect(m.strikes()).toBe(0)
  })

  it('holds back what was wanted once the page went down twice in a row with it', () => {
    const m = machine()
    expect(m.dying(X1).held).toBe(false)
    expect(m.dying(X1).held).toBe(false)
    expect(m.start().floor.rise(ALICE)).toEqual({ want: [X1], held: true })
  })

  it('does not count a run that loaded nothing: the page was closed before it had read what to load', () => {
    const m = machine()
    m.good(X1)
    for (let round = 0; round < 4; round += 1) expect(m.dying().held).toBe(false)
    expect(m.strikes()).toBe(0)
  })

  it('does not count a run that only let something go', () => {
    const m = machine()
    m.good(X1)
    for (let round = 0; round < 3; round += 1) {
      const run = m.start()
      run.floor.rise(ALICE)
      run.floor.unwant(ALICE, 'plugin:gone@v0')
    }
    expect(m.strikes()).toBe(0)
  })

  it('counts from zero again after a run that stayed up', () => {
    const m = machine()
    m.dying(X1)
    m.good(X1)
    m.dying(X1)
    expect(m.start().floor.rise(ALICE).held).toBe(false)
    expect(m.strikes()).toBe(1)
  })

  it('keeps holding it back at every start, for as long as it is wanted', () => {
    const m = machine()
    m.dying(X1)
    m.dying(X1)
    for (let round = 0; round < 3; round += 1) {
      const run = m.start()
      expect(run.floor.rise(ALICE)).toEqual({ want: [X1], held: true })
      run.floor.settle(ALICE)
      run.pass()
    }
  })

  it('lets go once what it held is no longer wanted: the next version is loaded, and a run that stays up clears the count', () => {
    const m = machine()
    m.dying(X1)
    m.dying(X1)
    const run = m.start()
    expect(run.floor.rise(ALICE).held).toBe(true)
    run.floor.want(ALICE, X2)
    run.floor.unwant(ALICE, X1)
    run.floor.settle(ALICE)
    run.pass()
    expect(m.strikes()).toBe(0)
    expect(m.start().floor.rise(ALICE)).toEqual({ want: [X2], held: false })
  })

  it('counts a run as staying up only after the wait, and not when something new is wanted meanwhile', () => {
    const m = machine()
    m.dying(X1)
    const run = m.start()
    run.floor.rise(ALICE)
    run.floor.settle(ALICE)
    expect(m.strikes()).toBe(1)
    run.floor.want(ALICE, X2)
    expect(run.waiting.size).toBe(0)
    run.pass()
    expect(m.strikes()).toBe(1)
    run.floor.settle(ALICE)
    run.floor.settle(ALICE)
    expect(run.waiting.size).toBe(1)
    run.pass()
    expect(m.strikes()).toBe(0)
  })

  it('does not count a tenant who signs in again on the same page as a start', () => {
    const m = machine()
    m.dying(X1)
    const run = m.start()
    expect(run.floor.rise(ALICE).held).toBe(false)
    expect(run.floor.rise(ALICE).held).toBe(false)
    expect(run.floor.rise(ALICE)).toEqual({ want: [X1], held: false })
    expect(m.strikes()).toBe(1)
  })

  it('keeps one floor for each tenant', () => {
    const m = machine()
    m.dying(X1)
    m.dying(X1)
    const run = m.start()
    expect(run.floor.rise(BOB)).toEqual({ want: [], held: false })
    expect(run.floor.rise(ALICE).held).toBe(true)
  })

  it.each([
    ['is not JSON', '{'],
    ['is not a floor', '{"up":"yes","want":[],"strikes":0}'],
    ['names something that is not a name', '{"up":true,"want":[1],"live":[],"strikes":5}'],
    ['counts in something that is not a number', '{"up":true,"want":[],"live":[],"strikes":"2"}'],
  ])('starts from the ground when what was kept %s', (_name, text) => {
    const m = machine()
    m.kept.set(`${FLOOR_KEY}:${ALICE}`, text)
    expect(m.start().floor.rise(ALICE)).toEqual({ want: [], held: false })
    expect(m.strikes()).toBe(0)
  })

  it('works for this run when nothing can be kept', () => {
    const floor = storedFloor(() => {
      throw new Error('no storage here')
    })
    expect(floor.rise(ALICE)).toEqual({ want: [], held: false })
    floor.want(ALICE, X1)
    expect(floor.rise(ALICE)).toEqual({ want: [X1], held: false })
  })

  it('tells who listens each time everything wanted has an outcome, at once and not after the wait', () => {
    const m = machine()
    const run = m.start()
    let told = 0
    const stop = run.floor.outcomes(() => (told += 1))
    run.floor.rise(ALICE)
    run.floor.want(ALICE, X1)
    expect(told).toBe(0)
    run.floor.settle(ALICE)
    run.floor.settle(ALICE)
    expect(told).toBe(2)
    stop()
    run.floor.settle(ALICE)
    expect(told).toBe(2)
  })

  it('ignores what is said for a tenant it did not rise for', () => {
    const m = machine()
    const run = m.start()
    run.floor.want(ALICE, X1)
    run.floor.settle(ALICE)
    expect(run.waiting.size).toBe(0)
    expect(m.kept.size).toBe(0)
  })
})

describe('when a run counts as having come up', () => {
  it('is after the wait, and only if the page has drawn what it shipped with by then', () => {
    vi.useFakeTimers()
    try {
      let drawn = false
      let ran = 0
      const later = whenDrawn(() => drawn)
      later(() => (ran += 1))
      vi.advanceTimersByTime(SETTLE_AFTER_MS)
      expect(ran).toBe(0)
      drawn = true
      later(() => (ran += 1))
      vi.advanceTimersByTime(SETTLE_AFTER_MS - 1)
      expect(ran).toBe(0)
      vi.advanceTimersByTime(1)
      expect(ran).toBe(1)
      const cancel = later(() => (ran += 1))
      cancel()
      vi.advanceTimersByTime(SETTLE_AFTER_MS)
      expect(ran).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
