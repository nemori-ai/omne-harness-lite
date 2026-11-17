import { describe, expect, it } from 'vitest'
import { SharedMap } from '../src/journal/shared-map.ts'

function random(seed: number) {
  let state = seed
  return (bound: number) => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state % bound
  }
}

const contents = <K, V>(map: Map<K, V>) => ({
  entries: [...map.entries()],
  keys: [...map.keys()],
  values: [...map.values()],
  spread: [...map],
  each: (() => {
    const seen: [K, V][] = []
    map.forEach((value, key) => seen.push([key, value]))
    return seen
  })(),
  size: map.size,
})

describe('SharedMap', () => {
  it('answers every read as a Map does after the same writes, in the same order', () => {
    for (const seed of [1, 7, 42, 1234]) {
      const next = random(seed)
      const native = new Map<string, number>()
      const shared = new SharedMap<string, number>()
      for (let step = 0; step < 400; step += 1) {
        const key = `k${String(next(30))}`
        const value = next(1000)
        switch (next(4)) {
          case 0:
          case 1:
            native.set(key, value)
            shared.set(key, value)
            break
          case 2:
            expect(shared.delete(key)).toBe(native.delete(key))
            break
          default:
            expect(shared.get(key)).toBe(native.get(key))
            expect(shared.has(key)).toBe(native.has(key))
        }
      }
      expect(contents(shared)).toEqual(contents(native))
      shared.clear()
      native.clear()
      expect(contents(shared)).toEqual(contents(native))
    }
  })

  it('starts from the entries it is given, keeping their order', () => {
    const entries: [string, number][] = [
      ['b', 1],
      ['a', 2],
      ['b', 3],
    ]
    expect(contents(new SharedMap(entries))).toEqual(contents(new Map(entries)))
  })

  it('a fork shares everything until one side writes, and neither side sees the other', () => {
    const origin = new SharedMap<string, number>([
      ['a', 1],
      ['b', 2],
    ])
    const fork = origin.fork()
    expect(fork.sharesWith(origin)).toBe(true)
    fork.set('c', 3)
    fork.delete('a')
    origin.set('b', 20)
    expect(fork.sharesWith(origin)).toBe(false)
    expect([...origin]).toEqual([
      ['a', 1],
      ['b', 20],
    ])
    expect([...fork]).toEqual([
      ['b', 2],
      ['c', 3],
    ])
  })

  it('a delete of an absent key changes nothing and keeps the sharing', () => {
    const origin = new SharedMap<string, number>([['a', 1]])
    const fork = origin.fork()
    expect(fork.delete('missing')).toBe(false)
    expect(fork.sharesWith(origin)).toBe(true)
  })
})
