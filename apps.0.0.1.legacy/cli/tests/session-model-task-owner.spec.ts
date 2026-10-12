import { expect, it, vi } from 'vitest'
import { createSessionModelTaskOwner } from '../src/session-model-task-owner.ts'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'

function registration(owner: ReturnType<typeof createSessionModelTaskOwner>, limit = 1) {
  const result = owner.acquire(limit)
  if ('unavailable' in result) throw new Error('selection registration unavailable')
  return result.registration
}

it('reserves capacity before work and releases it only after actual completion', async () => {
  const owner = createSessionModelTaskOwner('selection')
  const first = registration(owner)
  expect(owner.acquire(1)).toEqual({ unavailable: true })
  let finish!: () => void
  const work = first.start(
    'read',
    () =>
      new Promise<void>(resolve => {
        finish = resolve
      }),
  )
  await Promise.resolve()
  expect(() => first.release()).toThrow('not stopped')
  finish()
  await work.stopped
  first.release()
  expect(() => first.release()).toThrow('not stopped')
  const next = registration(owner)
  next.release()
  expect(await owner.close()).toEqual({ released: true })
})

it('requests cancellation but waits for the provider to actually finish', async () => {
  const owner = createSessionModelTaskOwner('selection')
  const held = registration(owner)
  let finish!: () => void
  const stopped = vi.fn()
  const task = held.start('read', signal => {
    signal.addEventListener('abort', stopped)
    return new Promise<void>(resolve => {
      finish = resolve
    })
  })
  await Promise.resolve()
  let closed = false
  const closing = owner.close().then(value => {
    closed = true
    return value
  })
  await Promise.resolve()
  expect(stopped).toHaveBeenCalledOnce()
  expect(closed).toBe(false)
  expect(owner.acquire(1)).toEqual({ unavailable: true })
  finish()
  await task.stopped
  held.release()
  expect(await closing).toEqual({ released: true })
})

it.each([
  { failure: 'unavailable' },
  { arbitrary: 'not a receipt' },
  { fail: new Error('lost commit result') },
])(
  'retains unconfirmed writes until their original owner releases the registration',
  async value => {
    const owner = createSessionModelTaskOwner('selection')
    const held = registration(owner)
    const task = held.start('append', async () => {
      if ('fail' in value) throw value.fail
      return value
    })
    await task.stopped
    expect(owner.unresolvedWrites()).toHaveLength(1)
    expect(await owner.unresolvedWrites()[0]!.completion).toEqual({ failure: 'unavailable' })
    expect(owner.acquire(1)).toEqual({ unavailable: true })
    expect(await owner.close()).toEqual({ unavailable: true })
    expect(await owner.close()).toEqual({ unavailable: true })
    held.release()
    expect(await owner.close()).toEqual({ released: true })
  },
)

it('does not treat a known rejection as an unknown write', async () => {
  const owner = createSessionModelTaskOwner('selection')
  const held = registration(owner)
  await held.start('append', async () => ({ failure: 'attemptSuperseded' })).stopped
  held.release()
  expect(owner.unresolvedWrites()).toEqual([])
  expect(await owner.close()).toEqual({ released: true })
})

it('accepts an exact positive JSON concurrency value and a successful single-record write', async () => {
  const owner = createSessionModelTaskOwner('selection')
  const acquired = owner.acquire(new LosslessNumber('1e0'))
  if ('unavailable' in acquired) throw new Error('exact concurrency was rejected')
  const task = acquired.registration.start('append', async () => ({ positions: [1], tail: 1 }))
  expect(await task.completion).toEqual({ positions: [1], tail: 1 })
  await task.stopped
  acquired.registration.release()
  expect(owner.unresolvedWrites()).toEqual([])
  expect(await owner.close()).toEqual({ released: true })
})

it('rejects invalid concurrency before registering any work', async () => {
  const owner = createSessionModelTaskOwner('selection')
  for (const value of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])
    expect(() => owner.acquire(value)).toThrow('concurrency')
  expect(await owner.close()).toEqual({ released: true })
})

it('keeps an unreleased registration visible after all its tasks end', async () => {
  const owner = createSessionModelTaskOwner('selection')
  const held = registration(owner)
  await held.start('read', async () => 'read').stopped
  expect(await owner.close()).toEqual({ unavailable: true })
  held.release()
  expect(await owner.close()).toEqual({ released: true })
})

it('owns control writes and complete multi-entry batches used by original Session writers', async () => {
  const owner = createSessionModelTaskOwner('selection')
  const held = registration(owner)
  await held.start('controlAppend', async () => ({ positions: [1], tail: 1 })).stopped
  await held.start('append', async () => ({ positions: [2, 3, 4], tail: 4 })).stopped
  expect(owner.unresolvedWrites()).toEqual([])
  held.release()
  expect(() => held.start('read', async () => undefined)).toThrow('closed')
  expect(await owner.close()).toEqual({ released: true })
})
