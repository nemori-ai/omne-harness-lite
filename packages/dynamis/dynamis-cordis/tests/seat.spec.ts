import { empty, placedBy, standing } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import { drop, gone, noSeats, put, ready, type Seats } from '../src/index.ts'
import { entry, mustPut, recomputed } from './support.ts'

const a1 = entry('host.list', 'k', { id: 'a1' })
const a2 = entry('host.list', 'k', { id: 'a2' })
const bad = entry('not a point', 'k')

const staged = (): Readonly<{ seats: Seats; batch: number }> => mustPut(noSeats, 'f1', 'mod', [a1])
const seated = (): Readonly<{ seats: Seats; batch: number }> => {
  const { seats, batch } = staged()
  return { seats: ready(seats, 'f1'), batch }
}
const mod1 = { fiber: 'mod', generation: 1 }

describe('座位的全化表（DC-1）', () => {
  describe('没有座位', () => {
    it('放一批（合法）：占一个名字，发第一代，备着；登记表不变', () => {
      const { seats } = staged()
      expect(seats.seats).toEqual([
        { fiber: 'f1', instance: mod1, seated: false, batches: [{ id: 1, entries: [a1] }] },
      ])
      expect(seats.registry).toBe(empty)
    })

    it('放一批（不合法）：拒绝，写明第一处，什么都不变', () => {
      const outcome = put(noSeats, 'f1', 'mod', [bad])
      expect(outcome).toEqual({
        kind: 'refused',
        detail: '"not a point" is not a point name <host>.<name>',
      })
    })

    it('放一批（一批里同一处放了两次）：拒绝', () => {
      const outcome = put(noSeats, 'f1', 'mod', [a1, a1])
      expect(outcome).toEqual({
        kind: 'refused',
        detail: 'host.list holds two entries of this instance at one spot',
      })
    })

    it('放一批（名字为空）：拒绝', () => {
      expect(put(noSeats, 'f1', '', [a1])).toEqual({
        kind: 'refused',
        detail: 'the fiber name is empty',
      })
    })

    it('撤一批、就绪、离开：什么都不做，给回同一个值', () => {
      expect(drop(noSeats, 'f1', 1)).toBe(noSeats)
      expect(ready(noSeats, 'f1')).toBe(noSeats)
      expect(gone(noSeats, 'f1')).toBe(noSeats)
    })
  })

  describe('备着', () => {
    it('放一批（合法）：加进备着的；登记表不变', () => {
      const first = staged()
      const second = mustPut(first.seats, 'f1', 'mod', [a2])
      expect(second.batch).toBe(2)
      expect(second.seats.seats).toEqual([
        {
          fiber: 'f1',
          instance: mod1,
          seated: false,
          batches: [
            { id: 1, entries: [a1] },
            { id: 2, entries: [a2] },
          ],
        },
      ])
      expect(second.seats.registry).toBe(empty)
    })

    it('放一批（不合法）：拒绝，座位照旧', () => {
      const { seats } = staged()
      expect(put(seats, 'f1', 'mod', [bad]).kind).toBe('refused')
    })

    it('放一批（和已备着的一批撞在同一处）：拒绝', () => {
      const { seats } = staged()
      expect(put(seats, 'f1', 'mod', [a1])).toEqual({
        kind: 'refused',
        detail: 'host.list holds two entries of this instance at one spot',
      })
    })

    it('撤一批：去掉这一批；别的批还在就还备着', () => {
      const first = staged()
      const second = mustPut(first.seats, 'f1', 'mod', [a2])
      const after = drop(second.seats, 'f1', first.batch)
      expect(after.seats).toEqual([
        { fiber: 'f1', instance: mod1, seated: false, batches: [{ id: 2, entries: [a2] }] },
      ])
      expect(after.registry).toBe(empty)
    })

    it('撤一批：一批都不剩就没有座位', () => {
      const { seats, batch } = staged()
      expect(drop(seats, 'f1', batch).seats).toEqual([])
    })

    it('撤一批（没有这一批）：什么都不做', () => {
      const { seats } = staged()
      expect(drop(seats, 'f1', 99)).toBe(seats)
    })

    it('就绪：整份装上，在位', () => {
      const first = staged()
      const second = mustPut(first.seats, 'f1', 'mod', [a2])
      const after = ready(second.seats, 'f1')
      expect(after.seats[0]?.seated).toBe(true)
      expect(standing(after.registry, mod1)).toBe('serving')
      expect(placedBy(after.registry, mod1).map(placed => placed.id)).toEqual(['a1', 'a2'])
      expect(after.registry).toEqual(recomputed(after))
    })

    it('离开：丢掉备着的，登记表从没见过它', () => {
      const { seats } = staged()
      const after = gone(seats, 'f1')
      expect(after.seats).toEqual([])
      expect(after.registry).toBe(empty)
    })
  })

  describe('在位', () => {
    it('放一批（合法）：加进去，整份重装', () => {
      const first = seated()
      const second = mustPut(first.seats, 'f1', 'mod', [a2])
      expect(placedBy(second.seats.registry, mod1).map(placed => placed.id)).toEqual(['a1', 'a2'])
      expect(second.seats.registry).toEqual(recomputed(second.seats))
    })

    it('放一批（不合法）：拒绝，登记表照旧', () => {
      const { seats } = seated()
      expect(put(seats, 'f1', 'mod', [bad]).kind).toBe('refused')
      expect(put(seats, 'f1', 'mod', [a1]).kind).toBe('refused')
    })

    it('撤一批：去掉这一批，剩下的重装', () => {
      const first = seated()
      const second = mustPut(first.seats, 'f1', 'mod', [a2])
      const after = drop(second.seats, 'f1', first.batch)
      expect(placedBy(after.registry, mod1).map(placed => placed.id)).toEqual(['a2'])
      expect(standing(after.registry, mod1)).toBe('serving')
    })

    it('撤一批：一批都不剩就取走实例，没有座位', () => {
      const { seats, batch } = seated()
      const after = drop(seats, 'f1', batch)
      expect(after.seats).toEqual([])
      expect(after.registry).toEqual(empty)
    })

    it('撤一批（没有这一批）：什么都不做', () => {
      const { seats } = seated()
      expect(drop(seats, 'f1', 99)).toBe(seats)
    })

    it('就绪：什么都不做', () => {
      const { seats } = seated()
      expect(ready(seats, 'f1')).toBe(seats)
    })

    it('离开：取走实例，没有座位', () => {
      const { seats } = seated()
      const after = gone(seats, 'f1')
      expect(after.seats).toEqual([])
      expect(after.registry).toEqual(empty)
    })
  })
})

describe('名字与代数（DC-3）', () => {
  it('同一个 fiber 离开再放：新的一代，代数只增', () => {
    const left = gone(seated().seats, 'f1')
    const again = mustPut(left, 'f1', 'mod', [a1])
    expect(again.seats.seats[0]?.instance).toEqual({ fiber: 'mod', generation: 2 })
    const third = mustPut(gone(again.seats, 'f1'), 'f1', 'mod', [a1])
    expect(third.seats.seats[0]?.instance).toEqual({ fiber: 'mod', generation: 3 })
  })

  it('两个活着的 fiber 同名：后占的加后缀，各有自己的实例', () => {
    const first = seated().seats
    const second = ready(mustPut(first, 'f2', 'mod', [a1]).seats, 'f2')
    expect(second.seats.map(seat => seat.instance)).toEqual([
      mod1,
      { fiber: 'mod~2', generation: 1 },
    ])
    const third = mustPut(second, 'f3', 'mod', [a1]).seats
    expect(third.seats[2]?.instance).toEqual({ fiber: 'mod~3', generation: 1 })
  })

  it('先占的走了，名字空出来：下一个同名的拿回原名，是新的一代', () => {
    const two = mustPut(seated().seats, 'f2', 'mod', [a1]).seats
    const left = gone(two, 'f1')
    const third = mustPut(left, 'f3', 'mod', [a1]).seats
    expect(third.seats.map(seat => seat.instance)).toEqual([
      { fiber: 'mod~2', generation: 1 },
      { fiber: 'mod', generation: 2 },
    ])
  })

  it('被拒绝的放入不占名字、不发代数、不发批号', () => {
    expect(put(noSeats, 'f1', 'mod', [bad]).kind).toBe('refused')
    const next = mustPut(noSeats, 'f1', 'mod', [a1])
    expect(next.batch).toBe(1)
    expect(next.seats.seats[0]?.instance).toEqual(mod1)
  })
})

describe('两家撞在同一处（DY-4 照旧）', () => {
  it('两个在位的座位各放一份：两份都在登记表里', () => {
    const first = seated().seats
    const second = ready(mustPut(first, 'f2', 'other', [a1]).seats, 'f2')
    expect(second.registry.placed.map(placed => placed.instance.fiber)).toEqual(['mod', 'other'])
    expect(second.registry).toEqual(recomputed(second))
  })
})
