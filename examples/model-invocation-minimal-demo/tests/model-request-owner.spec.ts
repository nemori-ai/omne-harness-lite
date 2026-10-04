import { describe, expect, it } from 'vitest'
import { createRequestOwner } from '../src/model-request-owner.ts'

describe('demo request owner task classification', () => {
  it('releases an actually stopped control append after the control tracker recognizes it', async () => {
    const request = createRequestOwner('control-owner')
    const acquired = request.owner.acquire(1)
    if (!('registration' in acquired)) throw new Error('owner admission failed')
    const task = acquired.registration.start('controlAppend', async () => ({
      failure: 'unavailable' as const,
    }))
    expect(await task.completion).toEqual({ failure: 'unavailable' })
    await task.stopped
    expect(request.retained()).toBe(true)
    expect(request.owner.unresolvedWrites()).toHaveLength(0)
    acquired.registration.release()
    expect(request.retained()).toBe(false)
    request.release()
  })

  it('retains an unresolved response append until its own registration is released', async () => {
    const request = createRequestOwner('response-owner')
    const first = request.owner.acquire(2)
    const second = request.owner.acquire(2)
    if (!('registration' in first) || !('registration' in second))
      throw new Error('owner admission failed')
    const unknown = async () => ({ failure: 'unavailable' as const })
    const firstTask = first.registration.start('append', unknown)
    const secondTask = second.registration.start('append', unknown)
    expect(await firstTask.completion).toEqual({ failure: 'unavailable' })
    expect(await secondTask.completion).toEqual({ failure: 'unavailable' })
    await Promise.all([firstTask.stopped, secondTask.stopped])
    // A pending receipt callback settles on a later microtask.
    await Promise.resolve()
    expect(request.owner.unresolvedWrites()).toHaveLength(2)
    expect(request.owner.acquire(2)).toEqual({ unavailable: true })
    // The runtime releases a registration only after its writer stopped and the original batch
    // was recognized or proven absent; that clears this registration's writer only.
    first.registration.release()
    expect(request.owner.unresolvedWrites()).toHaveLength(1)
    expect(request.owner.unresolvedWrites()[0]?.stopped).toBe(secondTask.stopped)
    expect(request.retained()).toBe(true)
    expect(() => request.release()).toThrow('request owner retained')
    second.registration.release()
    expect(request.owner.unresolvedWrites()).toHaveLength(0)
    expect(request.retained()).toBe(false)
    request.release()
  })
})
