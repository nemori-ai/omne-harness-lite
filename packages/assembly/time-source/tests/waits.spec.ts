import { getEventListeners } from 'node:events'
import { describe, expect, it } from 'vitest'
import { every, sleep, waitUntil } from '../src/index.ts'
import { simulatedTime } from '../src/simulated.ts'

describe('sleep and waitUntil', () => {
  it('answer elapsed when the wait fires', async () => {
    const time = simulatedTime({ wall: 1_000 })
    const slept = sleep(time.source, 200)
    const reached = waitUntil(time.source, 1_500)
    time.advance(500)
    expect(await Promise.all([slept, reached])).toEqual(['elapsed', 'elapsed'])
  })

  it('answer cancelled for a signal that is already aborted, and register nothing', async () => {
    const time = simulatedTime()
    const aborted = AbortSignal.abort()
    expect(await sleep(time.source, 10, aborted)).toBe('cancelled')
    expect(await waitUntil(time.source, 10, aborted)).toBe('cancelled')
    expect(time.pending()).toBe(0)
  })

  it('answer cancelled when the signal aborts while they wait, and withdraw the wait', async () => {
    const time = simulatedTime()
    const abort = new AbortController()
    const slept = sleep(time.source, 10, abort.signal)
    expect(time.pending()).toBe(1)
    abort.abort()
    expect(await slept).toBe('cancelled')
    expect(time.pending()).toBe(0)
  })

  it('do not answer twice when the signal aborts after the wait fired', async () => {
    const time = simulatedTime()
    const abort = new AbortController()
    const slept = sleep(time.source, 10, abort.signal)
    time.advance(10)
    abort.abort()
    expect(await slept).toBe('elapsed')
  })

  it('take their listener off the signal once the wait fired', async () => {
    const time = simulatedTime()
    const abort = new AbortController()
    const slept = sleep(time.source, 10, abort.signal)
    expect(getEventListeners(abort.signal, 'abort')).toHaveLength(1)
    time.advance(10)
    await slept
    expect(getEventListeners(abort.signal, 'abort')).toHaveLength(0)
  })
})

describe('every', () => {
  it('runs once per period until it is cancelled', () => {
    const time = simulatedTime()
    const at: number[] = []
    const stop = every(time.source, 100, () => at.push(time.source.elapsed()))
    time.advance(350)
    stop()
    time.advance(1_000)
    expect([at, time.pending()]).toEqual([[100, 200, 300], 0])
  })

  it('does not run again when the callback cancels it', () => {
    const time = simulatedTime()
    let runs = 0
    const stop = every(time.source, 100, () => {
      runs += 1
      stop()
    })
    time.advance(1_000)
    expect([runs, time.pending()]).toEqual([1, 0])
  })
})
