import { describe, expect, it } from 'vitest'
import { sleep, type TimeSource } from '../src/index.ts'
import { simulatedTime } from '../src/simulated.ts'

const scaled = (wall = 0) => {
  const host = simulatedTime()
  const time = simulatedTime({ wall })
  time.run({ speed: 1_000, follow: host.source })
  return { host, time }
}

describe('scaled pace', () => {
  it('reads the followed source times the speed on both clocks', () => {
    const { host, time } = scaled(50_000)
    host.advance(5)
    expect([time.source.elapsed(), time.source.now()]).toEqual([5_000, 55_000])
    host.advance(2)
    expect(time.source.now()).toBe(57_000)
  })

  it('fires a wait exactly when the followed source reaches its position over the speed', () => {
    const { host, time } = scaled()
    const fired: number[] = []
    time.source.after(5_000, () => fired.push(time.source.elapsed()))
    expect(host.pending()).toBe(1)
    host.advance(4)
    expect(fired).toEqual([])
    host.advance(1)
    expect([fired, host.pending(), time.pending()]).toEqual([[5_000], 0, 0])
  })

  it('waits on the followed source for the earliest wait only, and moves on when that wait is cancelled', () => {
    const { host, time } = scaled()
    const fired: string[] = []
    const cancelSooner = time.source.after(5_000, () => fired.push('sooner'))
    time.source.after(8_000, () => fired.push('later'))
    expect(host.pending()).toBe(1)
    host.advance(2)
    cancelSooner()
    expect(host.pending()).toBe(1)
    host.advance(5)
    expect(fired).toEqual([])
    host.advance(1)
    expect(fired).toEqual(['later'])
  })

  it('leaves nothing waiting on the followed source once its last wait is cancelled', () => {
    const { host, time } = scaled()
    const cancel = time.source.at(60_000, () => undefined)
    expect(host.pending()).toBe(1)
    cancel()
    expect(host.pending()).toBe(0)
  })

  it('starts a driver step from the current reading', () => {
    const { host, time } = scaled()
    let fired = false
    time.source.after(2_500, () => {
      fired = true
    })
    host.advance(2)
    time.advance(1_000)
    expect([fired, time.source.elapsed()]).toEqual([true, 3_000])
  })

  it('reads the position of the wait inside its callback, whatever the followed source did meanwhile', () => {
    let hostElapsed = 0
    const none = (): (() => void) => () => undefined
    const host: TimeSource = { now: () => 0, elapsed: () => hostElapsed, after: none, at: none }
    const time = simulatedTime()
    time.run({ speed: 1_000, follow: host })
    const seen: number[] = []
    time.source.after(500, () => {
      hostElapsed = 3
      seen.push(time.source.elapsed())
    })
    time.advance(500)
    expect([seen, time.source.elapsed()]).toEqual([[500], 3_500])
  })

  it('takes the followed time up to the switch when the pace goes back to manual, and stops there', () => {
    const { host, time } = scaled()
    time.source.after(60_000, () => undefined)
    host.advance(5)
    time.run('manual')
    expect([time.source.elapsed(), host.pending()]).toEqual([5_000, 0])
    host.advance(5)
    expect(time.source.elapsed()).toBe(5_000)
  })

  it('waits on the followed source for a wait that was registered before the switch', () => {
    const host = simulatedTime()
    const time = simulatedTime()
    let fired = false
    time.source.after(3_000, () => {
      fired = true
    })
    time.advance(1_000)
    host.advance(7)
    time.run({ speed: 1_000, follow: host.source })
    expect(time.source.elapsed()).toBe(1_000)
    host.advance(2)
    expect(fired).toBe(true)
  })

  it('follows the system time source when none is given', async () => {
    const time = simulatedTime()
    time.run({ speed: 1_000 })
    expect(await sleep(time.source, 5_000)).toBe('elapsed')
    expect(time.source.elapsed()).toBeGreaterThanOrEqual(5_000)
    time.run('manual')
  })

  it('refuses a speed that is not a positive finite number', () => {
    const time = simulatedTime()
    for (const speed of [0, -1]) expect(() => time.run({ speed })).toThrow('speed must be positive')
    for (const speed of [Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => time.run({ speed })).toThrow('speed must be a finite number')
  })
})
