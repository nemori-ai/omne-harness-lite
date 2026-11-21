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
} from '../src/index.ts'
import { below, pick, randomOf } from './support.ts'

const LIMIT = 2
const ASSETS = ['good', 'other', 'bad']

describe('DY-11：随机的起、倒、补装、安装与放开', () => {
  it('500 段动作序列：倒着时没有装上的；次数到上限后补装不动；坏的在场才会一再倒', () => {
    let heldSweeps = 0
    for (let seed = 1; seed <= 500; seed += 1) {
      const random = randomOf(seed)
      let floor: Floor = ground
      for (let at = 0; at < 60; at += 1) {
        const where = `seed ${seed} step ${at}`
        const before = floor
        const action = below(random, 7)
        const asset = pick(random, ASSETS)
        const outcome = [
          () => boot(floor),
          () => sweep(floor, LIMIT),
          () => settle(floor),
          () => (floor.live.includes('bad') ? crash(floor) : boot(floor)),
          () => want(floor, asset),
          () => unwant(floor, asset),
          () => resume(floor, LIMIT),
        ][action]?.()
        if (outcome === undefined) throw new Error('unreachable')
        floor = outcome.floor
        if (outcome.kind === 'stayed') expect(floor, where).toBe(before)
        // DownIsEmpty：倒着的时候没有装上的
        if (!floor.up) expect(floor.live, where).toEqual([])
        // 刚起来的那一步，装上的为空：起来只起底
        if (!before.up && floor.up) expect(floor.live, where).toEqual([])
        // 装上的总在要装的之内
        expect(
          floor.live.every(one => floor.want.includes(one)),
          where,
        ).toBe(true)
        // 次数到了上限，补装不动
        if (action === 1 && before.up && before.strikes >= LIMIT) {
          expect(outcome.kind, where).toBe('stayed')
          heldSweeps += 1
        }
        // 次数只在倒下时加一，只在稳定或放开时清零
        if (floor.strikes > before.strikes) expect(action, where).toBe(3)
        if (floor.strikes < before.strikes) expect([2, 6], where).toContain(action)
        // 只在起着的时候改要装的
        if (!before.up) expect(floor.want, where).toEqual(before.want)
      }
    }
    expect(heldSweeps).toBeGreaterThan(50)
  })
})
