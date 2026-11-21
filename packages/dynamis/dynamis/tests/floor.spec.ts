import { describe, expect, it } from 'vitest'
import {
  boot,
  crash,
  ground,
  resume,
  settle,
  sweep,
  unwant,
  want,
  type Floor,
  type Stepped,
} from '../src/index.ts'

const LIMIT = 2
const floor = (over: Partial<Floor>): Floor => ({
  up: true,
  want: [],
  live: [],
  strikes: 0,
  ...over,
})
const moved = (outcome: Stepped): Floor => {
  if (outcome.kind !== 'moved') throw new Error(`stayed: ${outcome.why}`)
  return outcome.floor
}
const stayed = (floor: Floor, why: string) => ({ kind: 'stayed', floor, why })

const down = floor({ up: false, want: ['a'], strikes: 1 })
const behind = floor({ want: ['a', 'b'], live: ['a'], strikes: 1 })
const held = floor({ want: ['a'], live: [], strikes: LIMIT })
const level = floor({ want: ['a'], live: ['a'], strikes: 1 })

describe('底的四种状态乘六个操作', () => {
  it('最初：倒着，什么都没有', () => {
    expect(ground).toEqual({ up: false, want: [], live: [], strikes: 0 })
  })

  it('倒着：boot 起来且装上的为空；其余都不动', () => {
    expect(moved(boot(down))).toEqual({ ...down, up: true })
    expect(sweep(down, LIMIT)).toEqual(stayed(down, 'down'))
    expect(settle(down)).toEqual(stayed(down, 'down'))
    expect(crash(down)).toEqual(stayed(down, 'down'))
    expect(want(down, 'b')).toEqual(stayed(down, 'down'))
    expect(unwant(down, 'a')).toEqual(stayed(down, 'down'))
    expect(resume(down, LIMIT)).toEqual(stayed(down, 'down'))
  })

  it('起着，装上的落后，次数没到上限：sweep 补齐', () => {
    expect(boot(behind)).toEqual(stayed(behind, 'up'))
    expect(moved(sweep(behind, LIMIT))).toEqual({ ...behind, live: ['a', 'b'] })
    expect(settle(behind)).toEqual(stayed(behind, 'unsettled'))
    expect(resume(behind, LIMIT)).toEqual(stayed(behind, 'nothing'))
  })

  it('起着，装上的落后，次数到了上限：sweep 不动；resume 放开', () => {
    expect(sweep(held, LIMIT)).toEqual(stayed(held, 'held'))
    expect(sweep({ ...held, strikes: LIMIT + 1 }, LIMIT)).toMatchObject({ why: 'held' })
    expect(moved(resume(held, LIMIT))).toEqual({ ...held, strikes: 0 })
    expect(moved(sweep(moved(resume(held, LIMIT)), LIMIT)).live).toEqual(['a'])
  })

  it('起着，装上的等于要装的：sweep 没事可做；settle 把次数清零', () => {
    expect(sweep(level, LIMIT)).toEqual(stayed(level, 'nothing'))
    expect(moved(settle(level))).toEqual({ ...level, strikes: 0 })
    expect(settle({ ...level, strikes: 0 })).toEqual(stayed({ ...level, strikes: 0 }, 'nothing'))
    expect(moved(resume({ ...level, strikes: LIMIT }, LIMIT)).strikes).toBe(0)
  })

  it('crash：倒下，装上的清空，次数加一，要装的不动', () => {
    expect(moved(crash(level))).toEqual({ up: false, want: ['a'], live: [], strikes: 2 })
    expect(moved(crash(floor({}))).strikes).toBe(1)
  })

  it('want：要装的与装上的一起加；已经要了的不动', () => {
    expect(moved(want(behind, 'c'))).toEqual({ ...behind, want: ['a', 'b', 'c'], live: ['a', 'c'] })
    expect(moved(want(behind, 'b'))).toEqual({ ...behind, live: ['a', 'b'] })
    expect(want(level, 'a')).toEqual(stayed(level, 'nothing'))
    expect(moved(want(held, 'b')).live).toEqual(['b'])
  })

  it('unwant：两边一起去掉；本来就没要的不动', () => {
    expect(moved(unwant(behind, 'a'))).toEqual({ ...behind, want: ['b'], live: [] })
    expect(moved(unwant(behind, 'b'))).toEqual({ ...behind, want: ['a'] })
    expect(unwant(level, 'z')).toEqual(stayed(level, 'nothing'))
  })

  it('集合按名字排，值是冻结的', () => {
    const next = moved(want(moved(want(floor({}), 'b')), 'a'))
    expect(next.want).toEqual(['a', 'b'])
    expect(next.live).toEqual(['a', 'b'])
    expect(Object.isFrozen(next) && Object.isFrozen(next.want) && Object.isFrozen(next.live)).toBe(
      true,
    )
  })
})
