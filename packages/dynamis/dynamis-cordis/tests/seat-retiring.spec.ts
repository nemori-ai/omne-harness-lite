import { empty, install, retire, standing, type Registry } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import {
  drained,
  drop,
  gone,
  instanceFor,
  leaving,
  noSeats,
  put,
  ready,
  type Seats,
} from '../src/index.ts'
import { entry } from './support.ts'

const a1 = entry('host.list', 'k', { id: 'a1' })
const a2 = entry('host.list', 'k', { id: 'a2' })
const a3 = entry('host.list', 'k', { id: 'a3' })
const mod1 = { fiber: 'mod', generation: 1 }
const mod2 = { fiber: 'mod', generation: 2 }

function must(seats: Seats, fiber: string, entries: readonly (typeof a1)[], drains = false) {
  const outcome = put(seats, fiber, 'mod', entries, drains)
  if (outcome.kind !== 'put') throw new Error(`refused: ${outcome.detail}`)
  return outcome
}

/** f1 seated with one batch that drains (1) and one that does not (2). */
function seated(): Seats {
  const one = must(noSeats, 'f1', [a1], true)
  return ready(must(one.seats, 'f1', [a2]).seats, 'f1')
}

const retiring = (): Seats => gone(seated(), 'f1')

function installed(registry: Registry, instance: typeof mod1, entries: readonly (typeof a1)[]) {
  const outcome = install(registry, instance, entries)
  if (outcome.kind !== 'installed') throw new Error(outcome.detail)
  return outcome.registry
}

describe('离开：有要排空的批（DC-2）', () => {
  it('在位：实例正在撤下，条目还在，座位撤下中', () => {
    const seats = retiring()
    expect(standing(seats.registry, mod1)).toBe('retiring')
    expect(seats.registry.serving).toEqual([])
    expect(seats.registry.placed.map(placed => placed.id)).toEqual(['a1', 'a2'])
    expect(seats.registry).toEqual(retire(installed(empty, mod1, [a1, a2]), mod1))
    expect(seats.seats).toEqual([
      {
        fiber: 'f1',
        instance: mod1,
        seated: true,
        retiring: [1],
        batches: [
          { id: 1, entries: [a1], drains: true },
          { id: 2, entries: [a2] },
        ],
      },
    ])
  })

  it('在位，没有要排空的批：照旧立刻取走', () => {
    const seats = gone(ready(must(noSeats, 'f1', [a1]).seats, 'f1'), 'f1')
    expect(seats.seats).toEqual([])
    expect(seats.registry).toEqual(empty)
  })

  it('备着：丢掉，不撤下。它没有服务过', () => {
    const seats = gone(must(noSeats, 'f1', [a1], true).seats, 'f1')
    expect(seats.seats).toEqual([])
    expect(seats.registry).toBe(empty)
  })
})

describe('撤下中的座位：前四个操作都不归它', () => {
  it('离开：什么都不做', () => {
    const seats = retiring()
    expect(gone(seats, 'f1')).toBe(seats)
  })

  it('就绪：什么都不做', () => {
    const seats = retiring()
    expect(ready(seats, 'f1')).toBe(seats)
  })

  it('撤一批：什么都不做，这一批留到排空完', () => {
    const seats = retiring()
    expect(drop(seats, 'f1', 1)).toBe(seats)
    expect(drop(seats, 'f1', 2)).toBe(seats)
  })

  it('放一批（合法）：开一个新的活座位，同一个名字，新的一代；旧的一代照旧撤下中', () => {
    const before = retiring()
    expect(instanceFor(before, 'f1', 'mod')).toEqual(mod2)
    const { seats } = must(before, 'f1', [a3])
    expect(seats.seats.map(seat => [seat.instance, seat.seated, seat.retiring])).toEqual([
      [mod1, true, [1]],
      [mod2, false, undefined],
    ])
    expect(seats.registry).toBe(before.registry)
    const both = ready(seats, 'f1')
    expect(standing(both.registry, mod1)).toBe('retiring')
    expect(standing(both.registry, mod2)).toBe('serving')
    expect(both.registry).toEqual(installed(before.registry, mod2, [a3]))
  })

  it('放一批（不合法）：拒绝，什么都不变', () => {
    const before = retiring()
    expect(put(before, 'f1', 'mod', [entry('not a point', 'k')]).kind).toBe('refused')
  })

  it('别的 fiber 同名：名字是空的，拿原名的下一代，不加后缀', () => {
    const { seats } = must(retiring(), 'f2', [a3])
    expect(seats.seats.at(-1)?.instance).toEqual(mod2)
  })
})

describe('一批排空完', () => {
  it('没有座位、备着、在位：什么都不做', () => {
    expect(drained(noSeats, 'f1', 1)).toBe(noSeats)
    const staged = must(noSeats, 'f1', [a1], true).seats
    expect(drained(staged, 'f1', 1)).toBe(staged)
    const serving = seated()
    expect(drained(serving, 'f1', 1)).toBe(serving)
    expect(standing(serving.registry, mod1)).toBe('serving')
  })

  it('撤下中，唯一要排空的批：取走实例，没有座位', () => {
    const seats = drained(retiring(), 'f1', 1)
    expect(seats.seats).toEqual([])
    expect(seats.registry).toEqual(empty)
  })

  it('撤下中，不是要排空的批或不认识的批：什么都不做', () => {
    const seats = retiring()
    expect(drained(seats, 'f1', 2)).toBe(seats)
    expect(drained(seats, 'f1', 99)).toBe(seats)
    expect(drained(seats, 'f2', 1)).toBe(seats)
  })

  it('两批都要排空：第一批排空完实例还在撤下，第二批排空完才取走；重复报不算数', () => {
    const one = must(noSeats, 'f1', [a1], true)
    const two = must(one.seats, 'f1', [a2], true)
    const left = gone(ready(two.seats, 'f1'), 'f1')
    const first = drained(left, 'f1', 1)
    expect(first.seats.map(seat => seat.retiring)).toEqual([[2]])
    expect(first.registry).toBe(left.registry)
    expect(drained(first, 'f1', 1)).toBe(first)
    const second = drained(first, 'f1', 2)
    expect(second.seats).toEqual([])
    expect(second.registry).toEqual(empty)
  })

  it('旧的一代排空完：只取走它，新的一代照常在服务', () => {
    const fresh = ready(must(retiring(), 'f1', [a3]).seats, 'f1')
    const seats = drained(fresh, 'f1', 1)
    expect(seats.seats.map(seat => seat.instance)).toEqual([mod2])
    expect(seats.registry).toEqual(installed(empty, mod2, [a3]))
  })
})

describe('代数只增（DC-3）', () => {
  it('旧的一代一批一批排空的时候，同名的后来者拿到的代数不回头', () => {
    const one = must(noSeats, 'f1', [a1], true)
    const two = must(one.seats, 'f1', [a2], true)
    const left = gone(ready(two.seats, 'f1'), 'f1')
    const second = gone(must(left, 'f1', [a3]).seats, 'f1')
    const partly = drained(second, 'f1', 1)
    expect(instanceFor(partly, 'f1', 'mod')).toEqual({ fiber: 'mod', generation: 3 })
  })
})

describe('leaving：这一批是不是在一个撤下中的座位上等着排空', () => {
  it('在位时不是；离开之后答它的实例；排空完之后不是', () => {
    expect(leaving(seated(), 'f1', 1)).toBeUndefined()
    expect(leaving(retiring(), 'f1', 1)).toEqual(mod1)
    expect(leaving(retiring(), 'f1', 2)).toBeUndefined()
    expect(leaving(drained(retiring(), 'f1', 1), 'f1', 1)).toBeUndefined()
  })
})
