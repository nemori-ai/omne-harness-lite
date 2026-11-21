import { expect, it } from 'vitest'
import { systemTime } from '../src/index.ts'
import { simulatedTime } from '../src/simulated.ts'

it('gives the driven system four methods and no way to the controls (TS-7)', () => {
  const time = simulatedTime()
  for (const source of [time.source, systemTime()]) {
    expect(Object.getOwnPropertyNames(source).sort()).toEqual(['after', 'at', 'elapsed', 'now'])
    expect(Object.getPrototypeOf(source)).toBe(Object.prototype)
    expect(Object.isFrozen(source)).toBe(true)
  }
  expect(Object.getOwnPropertyNames(time).sort()).toEqual([
    'advance',
    'hold',
    'next',
    'pending',
    'run',
    'setWall',
    'source',
    'timeline',
  ])
})
