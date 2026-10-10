import { expect, test, vi } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { SessionLog } from '@omne-harness-lite/session-log'
import { journalBoundaryFixture, journalIntent } from './runtime-journal-boundaries-fixture.ts'
import { ref, scope } from './execution-owner-fixture.ts'

test.each(['ref', 'origin', 'expected', 'values'])(
  'journal rejects a %s accessor before queue or storage IO without invoking it',
  async field => {
    const f = await journalBoundaryFixture()
    const getter = vi.fn(() => {
      throw new Error('caller getter')
    })
    const supplied = f.commitInput()
    Object.defineProperty(supplied, field, { enumerable: true, get: getter })
    try {
      expect(await f.journal.commit(supplied)).toEqual({ kind: 'rejected', reason: 'invalidInput' })
      expect(getter).not.toHaveBeenCalled()
      expect(f.readSince).not.toHaveBeenCalled()
      expect(f.append).not.toHaveBeenCalled()
    } finally {
      await f.close()
    }
  },
)

test('journal captures the complete original append before yielding to its session queue', async () => {
  const f = await journalBoundaryFixture()
  const supplied = f.commitInput()
  const original = journalIntent()
  try {
    const pending = f.journal.commit(supplied)
    supplied.ref.callId = unwrap(parseOpaqueIdentifier('foreign-call', 'CallId'))
    supplied.origin.run = 'foreign-run'
    supplied.expected.ownerGeneration = 'foreign-generation'
    supplied.expected.tail = 9
    supplied.values.length = 0
    expect(await pending).toHaveProperty('kind', 'view')
    const stored = await f.journal.read(scope, ref.callId)
    if (stored.kind !== 'view') throw new Error('missing committed view')
    expect(stored.executions.get(ref.callId)?.intent.value).toEqual(original)
    expect(stored.prefix.entries).toHaveLength(1)
    expect(f.append).toHaveBeenCalledOnce()
    expect(f.append.mock.calls[0]?.[3]).toEqual({ kind: 'tailEquals', tail: 0 })
    expect(f.borrow).toHaveBeenCalledOnce()
  } finally {
    await f.close()
  }
})

test('an open journal preserves the exact synchronous caller trap, while closed commit performs no caller inspection', async () => {
  const f = await journalBoundaryFixture()
  const exception = new Error('caller prototype trap')
  const trap = vi.fn((): never => {
    throw exception
  })
  const supplied = new Proxy(f.commitInput(), { getPrototypeOf: trap })
  try {
    let observed: unknown
    try {
      f.journal.commit(supplied)
    } catch (error) {
      observed = error
    }
    expect(observed).toBe(exception)
    expect(f.readSince).not.toHaveBeenCalled()
    await f.journal.close()
    trap.mockClear()
    expect(await f.journal.commit(supplied)).toEqual({ kind: 'rejected', reason: 'unavailable' })
    expect(trap).not.toHaveBeenCalled()
    expect(f.release).toHaveBeenCalledOnce()
  } finally {
    await f.close()
  }
})

test('close drains an original in-flight SQL append and confirms an unknown receipt before releasing the borrow', async () => {
  const f = await journalBoundaryFixture()
  const landed = Promise.withResolvers<void>()
  const receipt = Promise.withResolvers<Awaited<ReturnType<SessionLog['append']>>>()
  f.append.mockImplementationOnce(async (...args) => {
    const result = await f.log.append(...args)
    if ('failure' in result) throw new Error('fixture physical append failed')
    landed.resolve()
    return receipt.promise
  })
  try {
    const work = f.journal.commit(f.commitInput())
    await landed.promise
    const closing = f.journal.close()
    expect(f.journal.close()).toBe(closing)
    expect(f.release).not.toHaveBeenCalled()
    expect(await f.journal.read(scope, ref.callId)).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(await f.journal.commit(f.commitInput())).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    receipt.resolve({ failure: 'unavailable' })
    expect(await work).toEqual({ kind: 'rejected', reason: 'unavailable' })
    await closing
    expect(f.borrow).toHaveBeenCalledOnce()
    expect(f.append).toHaveBeenCalledOnce()
    expect(f.release).toHaveBeenCalledOnce()
    expect(await f.log.readSince(scope.session, 0)).toMatchObject({ tail: 1 })
    await f.journal.close()
    expect(f.release).toHaveBeenCalledOnce()
  } finally {
    receipt.resolve({ failure: 'unavailable' })
    await f.close()
  }
})

test('a failed confirming read retains the actual landed SQL batch until same-instance close recognizes it', async () => {
  const f = await journalBoundaryFixture()
  f.append.mockImplementationOnce(async (...args) => {
    const result = await f.log.append(...args)
    f.readSince.mockResolvedValueOnce({ failure: 'unavailable' })
    return result
  })
  try {
    expect(await f.journal.commit(f.commitInput())).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(f.release).not.toHaveBeenCalled()
    await f.journal.close()
    expect(f.release).toHaveBeenCalledOnce()
    expect(f.append).toHaveBeenCalledOnce()
    expect(f.borrow).toHaveBeenCalledOnce()
    expect(await f.log.readSince(scope.session, 0)).toMatchObject({ tail: 1 })
  } finally {
    await f.close()
  }
})

test('an absent unknown append keeps the original borrow across failed concurrent closes and explicit retry', async () => {
  const f = await journalBoundaryFixture()
  let original: Parameters<SessionLog['append']> | undefined
  f.append.mockImplementationOnce(async (session, entries, fence, condition) => {
    original = [session, entries, fence, condition]
    return { failure: 'unavailable' }
  })
  try {
    expect(await f.journal.commit(f.commitInput())).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    const closing = f.journal.close()
    expect(f.journal.close()).toBe(closing)
    await expect(closing).rejects.toThrow('unresolved writes')
    expect(f.release).not.toHaveBeenCalled()
    expect(f.borrow).toHaveBeenCalledOnce()
    if (!original) throw new Error('missing original physical request')
    expect(await f.log.append(...original)).not.toHaveProperty('failure')
    const retry = f.journal.close()
    expect(retry).not.toBe(closing)
    expect(f.journal.close()).toBe(retry)
    await retry
    expect(f.release).toHaveBeenCalledOnce()
    expect(f.borrow).toHaveBeenCalledOnce()
    expect(f.append).toHaveBeenCalledOnce()
  } finally {
    await f.close()
  }
})
