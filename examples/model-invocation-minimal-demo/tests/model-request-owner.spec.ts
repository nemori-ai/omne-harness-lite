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

  it('retains an unresolved response append as a separate writer debt', async () => {
    const request = createRequestOwner('response-owner')
    const acquired = request.owner.acquire(1)
    if (!('registration' in acquired)) throw new Error('owner admission failed')
    const task = acquired.registration.start('append', async () => ({
      failure: 'unavailable' as const,
    }))
    expect(await task.completion).toEqual({ failure: 'unavailable' })
    await task.stopped
    expect(request.owner.unresolvedWrites()).toHaveLength(1)
    acquired.registration.release()
    expect(request.retained()).toBe(true)
    expect(request.owner.acquire(1)).toEqual({ unavailable: true })
    expect(() => request.release()).toThrow('request owner retained')
  })
})
