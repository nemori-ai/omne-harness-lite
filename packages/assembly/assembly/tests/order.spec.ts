import { describe, expect, it } from 'vitest'
import { edgesOf, needsOf, startsAfter, stopsAfter, type RowEdges } from '../src/index.ts'

const row = (name: string, provides: string[], injects: string[]) => ({ name, provides, injects })

describe('停与起的次序只由依赖图定', () => {
  it('清单里的提供与注入变成行到行的边；注入没有人提供的键不成边', () => {
    const edges = edgesOf([
      row('storage', ['storage'], []),
      row('identity', ['identity'], ['storage', 'clock']),
      row('session', [], ['identity', 'storage', 'session']),
    ])
    expect([...edges]).toEqual([
      ['storage', []],
      ['identity', ['storage']],
      ['session', ['identity', 'storage']],
    ])
  })

  it('一条链：提供方在注入方结束之后才停，在注入方之前起', () => {
    const edges: RowEdges = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', []],
    ])
    expect([...stopsAfter(edges)]).toEqual([
      ['a', []],
      ['b', ['a']],
      ['c', ['a', 'b']],
    ])
    expect([...startsAfter(edges)]).toEqual([
      ['a', ['b', 'c']],
      ['b', ['c']],
      ['c', []],
    ])
  })

  it('没有依赖关系的不分先后；互相依赖的也不分先后', () => {
    const edges: RowEdges = new Map([
      ['x', ['y']],
      ['y', ['x']],
      ['z', []],
      ['w', ['x']],
    ])
    expect(stopsAfter(edges).get('x')).toEqual(['w'])
    expect(stopsAfter(edges).get('y')).toEqual(['w'])
    expect(stopsAfter(edges).get('z')).toEqual([])
    expect(startsAfter(edges).get('w')).toEqual(['x', 'y'])
  })

  it('随机的无环图：每条依赖都排进了两种次序，并且两种次序互为反向', () => {
    let seed = 9
    const next = (): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      return seed / 4294967296
    }
    const shapes = new Set<string>()
    for (let run = 0; run < 400; run += 1) {
      const names = Array.from({ length: 4 + Math.floor(next() * 6) }, (_, index) => `r${index}`)
      // An edge only goes from a later row to an earlier one: no cycle.
      const edges: RowEdges = new Map(
        names.map((name, index) => [name, names.slice(0, index).filter(() => next() < 0.35)]),
      )
      const needs = needsOf(edges)
      const stops = stopsAfter(edges)
      const starts = startsAfter(edges)
      for (const [name, needed] of needs)
        for (const other of needed) {
          expect(stops.get(other)).toContain(name)
          expect(starts.get(name)).toContain(other)
        }
      for (const [name, first] of stops)
        for (const other of first) expect(starts.get(other)).toContain(name)
      shapes.add(JSON.stringify([...edges]))
    }
    console.log(`order property: ${String(shapes.size)} distinct graphs of 400`)
    expect(shapes.size).toBeGreaterThan(300)
  })
})
