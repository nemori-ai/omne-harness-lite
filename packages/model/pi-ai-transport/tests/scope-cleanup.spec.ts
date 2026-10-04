import { describe, expect, it, vi } from 'vitest'
import { createScopeCleaner } from '../src/scope-cleanup.ts'

describe('D109 scope cleanup provider boundary', () => {
  it('deduplicates resources and keeps no-cache cleanup available', () => {
    const clearScope = vi.fn(() => {})
    const resource = { clearScope }
    const cleaner = createScopeCleaner([resource, resource])
    const scope = {}
    cleaner.clear(scope)
    cleaner.clear(scope)
    expect(clearScope).toHaveBeenCalledTimes(2)
    expect(() => createScopeCleaner([]).clear({})).not.toThrow()
    // Deliberate external representation negative control.
    // @ts-expect-error null is not a scope
    expect(() => cleaner.clear(null)).toThrow(TypeError)
  })
  it('attempts every owned resource before exposing synchronous failure', () => {
    const failure = new Error('failure')
    const good = vi.fn(() => {})
    const cleaner = createScopeCleaner([
      {
        clearScope: () => {
          throw failure
        },
      },
      { clearScope: good },
    ])
    expect(() => cleaner.clear({})).toThrow(failure)
    expect(good).toHaveBeenCalledOnce()
  })
  it('owns a nonconforming async result and prevents duplicate pending work', async () => {
    let finish = () => {}
    const pending = new Promise<void>(resolve => {
      finish = resolve
    })
    const clearScope = vi.fn<() => void>(() => pending)
    const cleaner = createScopeCleaner([{ clearScope }])
    const scope = {}
    expect(() => cleaner.clear(scope)).toThrow(TypeError)
    expect(() => cleaner.clear(scope)).toThrow(TypeError)
    expect(clearScope).toHaveBeenCalledOnce()
    let drained = false
    const drain = cleaner.drain().then(() => {
      drained = true
    })
    await Promise.resolve()
    expect(drained).toBe(false)
    finish()
    await drain
    clearScope.mockImplementation(() => {})
    cleaner.clear(scope)
    expect(clearScope).toHaveBeenCalledTimes(2)
  })
  it('observes rejection and refuses non-undefined results', async () => {
    const clearScope = vi.fn(() => Promise.reject(new Error('rejected cleanup')))
    const cleaner = createScopeCleaner([{ clearScope }])
    expect(() => cleaner.clear({})).toThrow(TypeError)
    await cleaner.drain()
    expect(() => createScopeCleaner([{ clearScope: () => 1 }]).clear({})).toThrow(TypeError)
  })
})
