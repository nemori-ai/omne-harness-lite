import { expect, test } from 'vitest'
import {
  createAssemblyLifetime,
  createRetainedWork,
  type RetainedCloseControl,
} from '../src/index.ts'

test('a conflicting control stops the generation without replacing the original obligation', async () => {
  const lifetime = createAssemblyLifetime(['row'], () => {})
  lifetime.tryClaim()
  let confirmed = false
  const original = createRetainedWork(Promise.resolve(), async () => {
    if (!confirmed) throw new Error('Original stop is unconfirmed')
  })
  const other = createRetainedWork(Promise.resolve(), async () => {})
  const port = lifetime.port('row')
  port.register(original.work)
  port.retainClose(original.control)
  port.retainClose(original.control)
  expect(() => port.retainClose(other.control)).toThrow(Error)
  expect(lifetime.isCurrent()).toBe(false)
  expect(lifetime.closeControl('row')).toBe(original.control)
  expect(await original.control.closeAttempt()).toBe('retained')
  confirmed = true
  expect(await original.control.retryClose()).toBe('closed')
  expect((await lifetime.closed).complete).toBe(true)
  expect(() => port.retainClose(original.control)).toThrow(Error)
  expect(lifetime.closeControl('row')).toBe(original.control)
})

test('late setup retention after stopping remains owned until actual row completion', async () => {
  const setup = Promise.withResolvers<void>()
  const lifetime = createAssemblyLifetime(['row'], () => {})
  lifetime.tryClaim()
  const owned = createRetainedWork(setup.promise, async () => {})
  lifetime.port('row').register(owned.work)
  const closing = lifetime.close()
  lifetime.port('row').retainClose(owned.control)
  expect(lifetime.closeControl('row')).toBe(owned.control)
  setup.resolve()
  expect((await closing).complete).toBe(true)
  expect(lifetime.closeControl('row')).toBe(owned.control)
})

test('unknown queries reject without authorizing a stop or hiding an absent control', async () => {
  const lifetime = createAssemblyLifetime(['row'], () => {})
  lifetime.tryClaim()
  expect(() => lifetime.closeControl('unknown')).toThrow(Error)
  expect(lifetime.isCurrent()).toBe(true)
  expect(lifetime.closeControl('row')).toBeUndefined()
  const owned = createRetainedWork(Promise.resolve(), async () => {})
  expect(() => lifetime.port('row').retainClose(owned.control)).toThrow(Error)
  expect(lifetime.isCurrent()).toBe(false)
  expect((await lifetime.closed).rows).toEqual([])
})

test.each([
  null,
  undefined,
  {},
  { closeAttempt: 1, retryClose() {} },
  {
    get closeAttempt() {
      throw new TypeError('Private getter failure')
    },
    retryClose() {},
  },
])(
  'invalid control stops the registered row and exposes only an Error usage failure',
  async input => {
    const lifetime = createAssemblyLifetime(['row'], () => {})
    lifetime.tryClaim()
    lifetime.port('row').register({ ready: Promise.resolve(), close: async () => {} })
    let error: unknown
    try {
      lifetime.port('row').retainClose(input as RetainedCloseControl)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(TypeError)
    expect(lifetime.isCurrent()).toBe(false)
    expect(lifetime.closeControl('row')).toBeUndefined()
    expect((await lifetime.closed).complete).toBe(true)
  },
)
