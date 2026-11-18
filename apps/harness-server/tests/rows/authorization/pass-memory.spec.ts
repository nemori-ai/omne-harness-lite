import { describe, expect, it } from 'vitest'
import { passMemory } from '../../../src/rows/authorization/pass-memory.ts'

describe('reads made once per judging pass', () => {
  it('one read per key, every read without a key, a new read for a new pass', async () => {
    let reads = 0
    const read = async () => ++reads
    const once = passMemory<number>()
    expect(await Promise.all([once('a', read), once('a', read), once('a', read)])).toEqual([
      1, 1, 1,
    ])
    expect(await once('b', read)).toBe(2)
    expect(await once(undefined, read)).toBe(3)
    expect(await once(undefined, read)).toBe(4)
    expect(await once('a', read)).toBe(1)
    expect(reads).toBe(4)
  })

  it('drops the oldest pass beyond its bound and reads it again', async () => {
    let reads = 0
    const read = async () => ++reads
    const once = passMemory<number>(2)
    await once('a', read)
    await once('b', read)
    await once('c', read)
    expect(await once('a', read)).toBe(4)
    expect(await once('c', read)).toBe(3)
  })
})
