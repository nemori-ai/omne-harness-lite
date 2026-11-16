import { describe, expect, it } from 'vitest'
import { simulatedTime, type TimelineEntry } from '../src/simulated.ts'

function prng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

type Tracked = Readonly<{ base: 'elapsed' | 'wall'; target: number; cancel: () => void }>

type Outcome = Readonly<{ fired: readonly number[]; timeline: readonly TimelineEntry[] }>

/** Runs a random sequence of readings, waits, cancels and driver steps, and checks every invariant after each one. */
function play(seed: number, steps: number): Outcome {
  const random = prng(seed)
  const pick = (below: number): number => Math.floor(random() * below)
  const time = simulatedTime({ wall: 1_000, record: true })
  const { source } = time
  const pending = new Map<number, Tracked>()
  const fired: number[] = []
  const cancelled = new Set<number>()
  let created = 0
  let registering = false

  const position = (wait: Tracked): number =>
    wait.base === 'elapsed' ? wait.target : wait.target - (source.now() - source.elapsed())

  const cancelOne = (): void => {
    const ids = [...pending.keys()]
    const id = ids[pick(ids.length)]
    if (id === undefined) return
    pending.get(id)?.cancel()
    pending.delete(id)
    cancelled.add(id)
  }

  const add = (depth: number): void => {
    created += 1
    const id = created
    const base = pick(3) === 0 ? 'wall' : 'elapsed'
    const delay = pick(40)
    const target = base === 'elapsed' ? source.elapsed() + delay : source.now() + delay - pick(10)
    const onFire = (): void => {
      expect(registering, 'a wait fired inside the call that registered it').toBe(false)
      const me = pending.get(id)
      if (me === undefined)
        throw new Error(`wait ${String(id)} fired after it was cancelled or fired`)
      for (const [other, wait] of pending) {
        const earlier = position(me) < position(wait)
        expect(earlier || (position(me) === position(wait) && id <= other)).toBe(true)
      }
      expect(source.elapsed()).toBeGreaterThanOrEqual(position(me))
      if (me.base === 'elapsed') expect(source.elapsed()).toBe(me.target)
      pending.delete(id)
      fired.push(id)
      if (depth < 3 && pick(3) === 0) add(depth + 1)
      if (pick(4) === 0) cancelOne()
    }
    registering = true
    const cancel = base === 'elapsed' ? source.after(delay, onFire) : source.at(target, onFire)
    registering = false
    pending.set(id, { base, target, cancel })
  }

  const drive = (): void => {
    const step = pick(6)
    if (step === 0) time.next()
    else if (step === 1) time.setWall(source.now() + pick(41) - 20)
    else time.advance(pick(50))
  }

  for (let step = 0; step < steps; step += 1) {
    const before = source.elapsed()
    const kind = pick(10)
    if (kind < 4) add(0)
    else if (kind === 4) cancelOne()
    else drive()
    expect(source.elapsed()).toBeGreaterThanOrEqual(before)
    expect(time.pending()).toBe(pending.size)
    if (kind > 4)
      for (const wait of pending.values()) expect(position(wait)).toBeGreaterThan(source.elapsed())
  }
  expect(new Set(fired).size).toBe(fired.length)
  expect(fired.filter(id => cancelled.has(id))).toEqual([])
  return { fired, timeline: time.timeline() }
}

describe('simulated time, random sequences (TS-1, TS-2, TS-3, TS-4, TS-6)', () => {
  it('keeps every invariant after each step of 300 random sequences', () => {
    let fires = 0
    for (let seed = 1; seed <= 300; seed += 1) fires += play(seed, 80).fired.length
    expect(fires).toBeGreaterThan(3_000)
  })

  it('gives the same firing order and the same timeline for the same sequence', () => {
    for (const seed of [7, 77, 777]) expect(play(seed, 120)).toEqual(play(seed, 120))
  })
})

describe('simulated time, one line per commitment', () => {
  it('reads the wall clock as the offset plus the monotonic reading', () => {
    const time = simulatedTime({ wall: 5_000 })
    time.advance(250)
    expect([time.source.elapsed(), time.source.now()]).toEqual([250, 5_250])
  })

  it('setWall moves only the wall reading and fires the at-waits it makes due', () => {
    const time = simulatedTime({ wall: 1_000 })
    const fired: string[] = []
    time.source.at(9_000, () => fired.push('at'))
    time.source.after(100, () => fired.push('after'))
    time.setWall(9_000)
    expect([fired, time.source.elapsed(), time.source.now()]).toEqual([['at'], 0, 9_000])
    time.advance(100)
    expect(fired).toEqual(['at', 'after'])
  })

  it('setWall backwards makes an at-wait later, never earlier', () => {
    const time = simulatedTime({ wall: 1_000 })
    let fired = false
    time.source.at(1_100, () => {
      fired = true
    })
    time.setWall(500)
    time.advance(599)
    expect(fired).toBe(false)
    time.advance(1)
    expect(fired).toBe(true)
  })

  it('next jumps to the earliest wait and answers false when there is none', () => {
    const time = simulatedTime()
    time.source.after(86_400_000, () => undefined)
    expect([time.next(), time.source.elapsed(), time.next()]).toEqual([true, 86_400_000, false])
  })

  it('counts a negative delay as zero and still does not fire inside the call', () => {
    const time = simulatedTime()
    let fired = false
    time.source.after(-5, () => {
      fired = true
    })
    expect(fired).toBe(false)
    time.advance(0)
    expect(fired).toBe(true)
  })

  it('refuses numbers that are not finite and registers nothing', () => {
    const time = simulatedTime()
    const none = (): void => undefined
    expect(() => time.source.after(Number.NaN, none)).toThrow(TypeError)
    expect(() => time.source.at(Number.POSITIVE_INFINITY, none)).toThrow(TypeError)
    expect(() => time.advance(Number.NaN)).toThrow(TypeError)
    expect(() => time.advance(-1)).toThrow(TypeError)
    expect(() => time.setWall(Number.NaN)).toThrow(TypeError)
    expect(() => simulatedTime({ wall: Number.NaN })).toThrow(TypeError)
    expect([time.pending(), time.source.elapsed()]).toEqual([0, 0])
  })

  it('refuses a driver step from inside a callback and leaves the state as it was', () => {
    const time = simulatedTime()
    const refused: unknown[] = []
    time.source.after(10, () => {
      for (const step of [
        () => time.advance(1),
        () => time.next(),
        () => time.setWall(0),
        () => time.run('idle-jump'),
      ])
        try {
          step()
        } catch (error) {
          refused.push(error)
        }
    })
    time.source.after(20, () => undefined)
    time.advance(10)
    expect(refused.map(error => error instanceof TypeError)).toEqual([true, true, true, true])
    expect([time.source.elapsed(), time.pending()]).toEqual([10, 1])
  })

  it('passes a callback error to the driver, stops at that wait, and keeps the rest', () => {
    const time = simulatedTime()
    const fired: number[] = []
    time.source.after(10, () => {
      throw new Error('boom')
    })
    time.source.after(10, () => fired.push(2))
    time.source.after(30, () => fired.push(3))
    expect(() => time.advance(50)).toThrow('boom')
    expect([time.source.elapsed(), time.pending(), fired]).toEqual([10, 2, []])
    time.advance(40)
    expect([time.source.elapsed(), fired]).toEqual([50, [2, 3]])
  })

  it('stops a zero-delay loop instead of spinning for ever', () => {
    const time = simulatedTime()
    const again = (): void => void time.source.after(0, again)
    again()
    expect(() => time.advance(1)).toThrow(/without time passing/u)
  })

  it('fires many waits that were due at one instant before the step', () => {
    const time = simulatedTime()
    let fired = 0
    for (let index = 0; index < 20_000; index += 1) time.source.after(5, () => (fired += 1))
    time.advance(5)
    expect(fired).toBe(20_000)
  })
})
