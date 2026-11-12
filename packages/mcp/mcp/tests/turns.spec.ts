// The turns of the critical section: one run at a time per key, each caller gets its own result,
// and a run that rejects does not block the key.
import { describe, expect, it } from 'vitest'
import { createTurns } from '../src/internal/turns.ts'
import { deferred, settled } from './doubles/deferred.ts'

describe('inTurn', () => {
  it('runs the second run of a key only after the first ended, with each result to its caller', async () => {
    const turns = createTurns()
    const first = deferred<'one'>()
    const order: string[] = []
    const a = turns.inTurn('k', async () => {
      order.push('a starts')
      const value = await first.promise
      order.push('a ends')
      return value
    })
    const b = turns.inTurn('k', async () => {
      order.push('b starts')
      return 'two' as const
    })
    await settled()
    expect(order).toEqual(['a starts'])
    first.resolve('one')
    expect(await a).toBe('one')
    expect(await b).toBe('two')
    expect(order).toEqual(['a starts', 'a ends', 'b starts'])
  })

  it('does not serialize two keys', async () => {
    const turns = createTurns()
    const first = deferred<void>()
    const order: string[] = []
    void turns.inTurn('k', async () => {
      await first.promise
    })
    const other = turns.inTurn('j', async () => {
      order.push('j ran')
    })
    await other
    expect(order).toEqual(['j ran'])
    first.resolve()
  })

  it('lets the next run of the key start after a run that rejected', async () => {
    const turns = createTurns()
    const failing = turns.inTurn('k', () => Promise.reject(new Error('run failed')))
    await expect(failing).rejects.toThrow('run failed')
    expect(await turns.inTurn('k', async () => 'next')).toBe('next')
  })
})
