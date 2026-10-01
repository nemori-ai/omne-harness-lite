import { describe, expect, it } from 'vitest'
import { createDemoCallHost } from '../src/model-call-host.ts'

describe('demo model call host', () => {
  it('registers before stop, rejects late registration and retains unavailable owners', async () => {
    const owner = createDemoCallHost()
    let attempts = 0
    const registered = owner.host.register(async () => {
      attempts++
      return attempts === 1 ? { unavailable: true } : { released: true }
    })
    expect('registration' in registered).toBe(true)
    expect(await owner.stop()).toEqual({ unavailable: true })
    expect(owner.host.signal.aborted).toBe(true)
    expect(owner.host.stopping()).toBe(true)
    expect(owner.host.register(async () => ({ released: true }))).toEqual({ runtimeStopped: true })
    expect(await owner.stop()).toEqual({ released: true })
    expect(attempts).toBe(2)
  })

  it('requests all closes, shares an in-flight stop and retries a throwing owner', async () => {
    const owner = createDemoCallHost()
    let finish: (() => void) | undefined
    let first = true
    owner.host.register(
      () =>
        new Promise(resolve => {
          finish = () => resolve({ released: true })
        }),
    )
    owner.host.register(async () => {
      if (first) {
        first = false
        throw new Error('close failed')
      }
      return { released: true }
    })
    const a = owner.stop(),
      b = owner.stop()
    expect(a).toBe(b)
    await Promise.resolve()
    finish?.()
    expect(await a).toEqual({ unavailable: true })
    expect(await owner.stop()).toEqual({ released: true })
  })
})
