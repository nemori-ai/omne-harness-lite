import { afterEach, describe, expect, it, vi } from 'vitest'
import { sleep, systemTime, waitUntil } from '../src/index.ts'
import { HOST_TIMER_LIMIT_MS } from '../src/system.ts'

afterEach(() => {
  vi.useRealTimers()
})

describe('system time on the host clock (TS-1, TS-4)', () => {
  it('after fires once the monotonic reading has grown by at least the delay', async () => {
    const time = systemTime()
    const start = time.elapsed()
    expect(await sleep(time, 20)).toBe('elapsed')
    expect(time.elapsed() - start).toBeGreaterThanOrEqual(20)
  })

  it('at fires once the wall reading has reached the instant', async () => {
    const time = systemTime()
    const target = time.now() + 20
    expect(await waitUntil(time, target)).toBe('elapsed')
    expect(time.now()).toBeGreaterThanOrEqual(target)
  })

  it('a wait that is already due does not fire inside the call', async () => {
    const time = systemTime()
    let fired = false
    const done = new Promise<void>(resolve => {
      time.at(time.now() - 1_000, () => {
        fired = true
        resolve()
      })
    })
    expect(fired).toBe(false)
    await done
  })

  it('a cancelled wait does not fire, and cancelling again does nothing', async () => {
    const time = systemTime()
    let fired = false
    const cancel = time.after(5, () => {
      fired = true
    })
    cancel()
    cancel()
    await sleep(time, 25)
    expect(fired).toBe(false)
  })

  it('a background wait does not keep the host process alive', () => {
    const timers: NodeJS.Timeout[] = []
    const hostSetTimeout = setTimeout
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      ...args: Parameters<typeof setTimeout>
    ) => {
      const timer = hostSetTimeout(...args)
      timers.push(timer)
      return timer
    }) as typeof setTimeout)
    const time = systemTime()
    const cancels = [
      time.after(60_000, () => undefined),
      time.after(60_000, () => undefined, { background: true }),
      time.at(time.now() + 60_000, () => undefined, { background: true }),
    ]
    spy.mockRestore()
    expect(timers.map(timer => timer.hasRef())).toEqual([true, false, false])
    for (const cancel of cancels) cancel()
  })

  it('a wait holds the host only while it is pending, and a background wait never does', () => {
    const held = (): number =>
      process.getActiveResourcesInfo().filter(kind => kind === 'Timeout').length
    const before = held()
    const time = systemTime()
    const cancelBackground = time.after(60_000, () => undefined, { background: true })
    expect(held()).toBe(before)
    const cancel = time.at(time.now() + 60_000, () => undefined)
    expect(held()).toBe(before + 1)
    cancel()
    expect(held()).toBe(before)
    cancelBackground()
  })

  it('refuses numbers that are not finite', () => {
    const time = systemTime()
    const none = (): void => undefined
    expect(() => time.after(Number.NaN, none)).toThrow(TypeError)
    expect(() => time.after(Number.NaN, none)).toThrow('delayMs must be a finite number')
    expect(() => time.at(Number.POSITIVE_INFINITY, none)).toThrow(TypeError)
    expect(() => time.at(Number.POSITIVE_INFINITY, none)).toThrow('epochMs must be a finite number')
  })
})

describe('system time past the host timer limit', () => {
  it('keeps waiting in segments and fires only at the end', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
    const time = systemTime()
    let fired = false
    time.after(HOST_TIMER_LIMIT_MS + 5_000, () => {
      fired = true
    })
    vi.advanceTimersByTime(HOST_TIMER_LIMIT_MS)
    expect(fired).toBe(false)
    vi.advanceTimersByTime(4_999)
    expect(fired).toBe(false)
    vi.advanceTimersByTime(1)
    expect(fired).toBe(true)
  })

  it('a cancel during a later segment stops the wait', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
    const time = systemTime()
    let fired = false
    const cancel = time.after(HOST_TIMER_LIMIT_MS + 5_000, () => {
      fired = true
    })
    vi.advanceTimersByTime(HOST_TIMER_LIMIT_MS)
    cancel()
    vi.advanceTimersByTime(10_000)
    expect([fired, vi.getTimerCount()]).toEqual([false, 0])
  })

  it('at checks the wall clock again when it wakes: a clock set back makes it wait on', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
    vi.setSystemTime(10_000)
    const time = systemTime()
    let fired = false
    time.at(11_000, () => {
      fired = true
    })
    vi.setSystemTime(9_000)
    vi.advanceTimersByTime(1_000)
    expect(fired).toBe(false)
    vi.advanceTimersByTime(1_000)
    expect(fired).toBe(true)
  })
})
