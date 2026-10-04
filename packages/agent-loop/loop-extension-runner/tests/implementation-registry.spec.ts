import { describe, expect, it, vi } from 'vitest'
import { judgeInput } from '@omne-harness-lite/loop-extension'
import {
  createRunnerImplementationRegistry,
  type RunnerBuiltinImplementation,
} from '../src/index.ts'

const judged = judgeInput({
  position: 'before_persist_message',
  subject: {
    producer: 'user',
    message: { id: 'message', type: 'user', blocks: [], createdAt: '2026-09-29T00:00:00Z' },
  },
  earlier: [],
  log: 'log',
  environment: 'environment',
})
if (!('ok' in judged)) throw new Error('fixture invalid')
const input = judged.ok,
  mode = { kind: 'fresh' } as const
function latch() {
  let resolve = () => {}
  const promise = new Promise<void>(r => {
    resolve = r
  })
  return { promise, resolve }
}
const observed: RunnerBuiltinImplementation = async () => ({
  kind: 'output',
  value: { kind: 'observed' },
})

describe('unique builtin contribution generations', () => {
  it('rejects duplicate or malformed registrations without replacing the existing contribution', async () => {
    const registry = createRunnerImplementationRegistry(),
      old = vi.fn(observed),
      other = vi.fn(observed)
    registry.registerBuiltin('extension', old)
    expect(() => registry.registerBuiltin('extension', other)).toThrow()
    expect(() => registry.registerBuiltin('', observed)).toThrow()
    expect(() => Reflect.apply(registry.registerBuiltin, undefined, ['bad', null])).toThrow()
    const lease = registry.capture('extension')
    if ('absent' in lease) throw new Error('original contribution lost')
    expect(await lease.invoke(input, new AbortController().signal, mode)).toMatchObject({
      kind: 'output',
    })
    expect(old).toHaveBeenCalledOnce()
    expect(other).not.toHaveBeenCalled()
  })
  it('old disposer never removes the replacement and a withdrawn capture cannot start', async () => {
    const registry = createRunnerImplementationRegistry(),
      old = vi.fn(observed),
      replacement = vi.fn(observed)
    const dispose = registry.registerBuiltin('extension', old),
      oldLease = registry.capture('extension')
    if ('absent' in oldLease) throw new Error('capture absent')
    dispose()
    registry.registerBuiltin('extension', replacement)
    dispose()
    expect(await oldLease.invoke(input, new AbortController().signal, mode)).toEqual({
      kind: 'notStartedUnavailable',
    })
    const newLease = registry.capture('extension')
    if ('absent' in newLease) throw new Error('replacement lost')
    await newLease.invoke(input, new AbortController().signal, mode)
    expect(old).not.toHaveBeenCalled()
    expect(replacement).toHaveBeenCalledOnce()
  })
  for (const rejects of [false, true])
    it(`withdrawn started contribution cannot return a late ${rejects ? 'rejection' : 'output'}`, async () => {
      const registry = createRunnerImplementationRegistry(),
        started = latch(),
        finish = latch()
      const dispose = registry.registerBuiltin('extension', async () => {
        started.resolve()
        await finish.promise
        if (rejects) throw new Error('sensitive contributor message')
        return { kind: 'output', value: { kind: 'observed' } }
      })
      const lease = registry.capture('extension')
      if ('absent' in lease) throw new Error('capture absent')
      const pending = lease.invoke(input, new AbortController().signal, mode)
      await started.promise
      dispose()
      registry.registerBuiltin('extension', observed)
      finish.resolve()
      expect(await pending).toEqual({
        kind: 'errored',
        error: 'Builtin implementation withdrawn during invocation',
      })
    })
  it('instance stop takes precedence and drain waits for the actual contribution', async () => {
    const registry = createRunnerImplementationRegistry(),
      started = latch(),
      finish = latch()
    registry.registerBuiltin('extension', async () => {
      started.resolve()
      await finish.promise
      throw new Error('late rejection')
    })
    const lease = registry.capture('extension')
    if ('absent' in lease) throw new Error('capture absent')
    const pending = lease.invoke(input, new AbortController().signal, mode)
    await started.promise
    registry.closeAdmission()
    let drained = false
    const drain = registry.drain().then(() => {
      drained = true
    })
    await Promise.resolve()
    expect(drained).toBe(false)
    expect(registry.capture('extension')).toEqual({ absent: true })
    expect(() => registry.registerBuiltin('extension', observed)).toThrow()
    finish.resolve()
    expect(await pending).toEqual({ kind: 'controlUnavailable' })
    await drain
    expect(drained).toBe(true)
  })
})
