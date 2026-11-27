import {
  ask,
  declare,
  empty,
  install,
  retire,
  standing,
  type Contract,
} from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import {
  drained,
  drop,
  gone,
  instanceFor,
  noSeats,
  put,
  ready,
  rollout,
  type Seats,
} from '../src/index.ts'
import { below, entry, randomOf } from './support.ts'

const a1 = entry('host.one', 'k', { digest: 'a1' })
const a2 = entry('host.one', 'k', { digest: 'a2' })
const mod1 = { fiber: 'mod', generation: 1 }
const mod2 = { fiber: 'mod', generation: 2 }

const one: Contract = {
  name: 'host.one',
  tree: 'server',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'k',
  gives: 'nothing',
  item: { kind: 'data', fields: { label: 'string' } },
  resolve: 'conflict',
  binding: 'run',
  onError: 'none',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
  summary: 'One item for each key.',
}

function must(
  seats: Seats,
  ...rest: Parameters<typeof put> extends [Seats, ...infer R] ? R : never
) {
  const outcome = put(seats, ...rest)
  if (outcome.kind !== 'put') throw new Error(`refused: ${outcome.detail}`)
  return outcome
}

/** f1 seated as mod#1 with one batch; `drains` says whether that batch drains. */
const served = (drains = false): Seats =>
  ready(must(noSeats, 'f1', 'mod', [a1], drains).seats, 'f1')
/** On top of `served`: f2 stands by to succeed mod#1, its fiber not ready yet. */
const staged = (drains = false): Seats => must(served(drains), 'f2', 'mod', [a2], false, mod1).seats
const risen = (drains = false): Seats => ready(staged(drains), 'f2')

const refusal = (seats: Seats, old: typeof mod1, fiber: string): string => {
  const outcome = rollout(seats, old, fiber)
  if (outcome.kind !== 'refused') throw new Error('the rollout held')
  // Refused: nothing changes, the old generation is still seated.
  expect(standing(seats.registry, mod1)).toBe('serving')
  return outcome.reason
}

describe('等换代的座位', () => {
  it('写明接替谁：用被接替者的名字，不加后缀，代数取下一个；登记表不变', () => {
    const seats = staged()
    expect(instanceFor(seats, 'f2', 'mod')).toEqual(mod2)
    expect(instanceFor(served(), 'f2', 'mod', mod1)).toEqual(mod2)
    expect(instanceFor(served(), 'f2', 'mod')).toEqual({ fiber: 'mod~2', generation: 1 })
    expect(seats.registry).toEqual(served().registry)
    expect(seats.seats.map(seat => [seat.fiber, seat.instance, seat.seated])).toEqual([
      ['f1', mod1, true],
      ['f2', mod2, false],
    ])
  })

  it('就绪：fiber 记为就绪，座位仍备着，登记表不变', () => {
    const seats = risen()
    expect(seats.registry).toEqual(served().registry)
    expect(seats.seats.find(seat => seat.fiber === 'f2')?.seated).toBe(false)
    expect(ready(seats, 'f2')).toBe(seats)
  })

  it('再放一批、撤一批：都只动备着的，登记表不变', () => {
    const more = must(staged(), 'f2', 'mod', [entry('host.one', 'j')])
    expect(more.seats.registry).toEqual(served().registry)
    expect(drop(more.seats, 'f2', more.batch).registry).toEqual(served().registry)
  })

  it('离开：丢掉备着的；它用过的代数不重用', () => {
    const left = gone(risen(), 'f2')
    expect(left.registry).toEqual(served().registry)
    expect(left.seats.map(seat => seat.fiber)).toEqual(['f1'])
    expect(instanceFor(left, 'f3', 'mod', mod1)).toEqual({ fiber: 'mod', generation: 3 })
  })

  it('同一个被接替者已经有一代等着：拒绝，什么都不变', () => {
    const outcome = put(staged(), 'f3', 'mod', [a2], false, mod1)
    expect(outcome).toMatchObject({ kind: 'refused', reason: 'awaited' })
  })
})

describe('换代（rollout）：全化表的一行', () => {
  it('成立，旧的没有要排空的批：同一步里旧的取走，新的在位', () => {
    const outcome = rollout(risen(), mod1, 'f2')
    if (outcome.kind !== 'rolled') throw new Error(outcome.detail)
    const installed = install(empty, mod2, [a2])
    expect(outcome.seats.registry).toEqual(installed.kind === 'installed' && installed.registry)
    expect(outcome.seats.seats.map(seat => [seat.fiber, seat.instance, seat.seated])).toEqual([
      ['f2', mod2, true],
    ])
    expect(outcome.seats.issued).toEqual({ mod: 2 })
  })

  it('成立，旧的有要排空的批：旧的撤下中，条目还在，答案不再看它；排空完取走', () => {
    const outcome = rollout(risen(true), mod1, 'f2')
    if (outcome.kind !== 'rolled') throw new Error(outcome.detail)
    const { registry } = outcome.seats
    expect(standing(registry, mod1)).toBe('retiring')
    expect(registry.serving).toEqual([mod2])
    const both = install(retire(served(true).registry, mod1), mod2, [a2])
    expect(registry).toEqual(both.kind === 'installed' && both.registry)
    const done = drained(outcome.seats, 'f1', 1)
    expect(standing(done.registry, mod1)).toBe('absent')
    expect(done.seats.map(seat => seat.fiber)).toEqual(['f2'])
  })

  it('只放一项的点上：换之前、换之后都答一项，不答冲突（DC-5）', () => {
    const declared = must(noSeats, 'host', 'host', [declare(one)]).seats
    const base = ready(must(ready(declared, 'host'), 'f1', 'mod', [a1], true).seats, 'f1')
    const before = ready(must(base, 'f2', 'mod', [a2], false, mod1).seats, 'f2')
    expect(ask(before.registry, 'host.one', 'k', [])).toMatchObject({
      kind: 'one',
      entry: { digest: 'a1' },
    })
    const outcome = rollout(before, mod1, 'f2')
    if (outcome.kind !== 'rolled') throw new Error(outcome.detail)
    expect(ask(outcome.seats.registry, 'host.one', 'k', [])).toMatchObject({
      kind: 'one',
      entry: { digest: 'a2' },
    })
  })

  it('没有活的座位：拒绝', () => {
    expect(refusal(served(), mod1, 'f2')).toBe('no-seat')
  })

  it('备着但不是等换代的：拒绝', () => {
    const plain = must(served(), 'f2', 'other', [entry('host.one', 'j')]).seats
    expect(refusal(plain, mod1, 'f2')).toBe('not-awaiting')
  })

  it('在位：拒绝，它已经在服务', () => {
    expect(refusal(served(), mod1, 'f1')).toBe('seated')
  })

  it('给的旧实例不是它写明要接替的那一个：拒绝', () => {
    const other = ready(must(risen(), 'f3', 'else', [entry('host.one', 'j')]).seats, 'f3')
    expect(refusal(other, { fiber: 'else', generation: 1 }, 'f2')).toBe('other-predecessor')
  })

  it('给的旧实例是同一个 fiber 的另一代：照样不是它要接替的那一个', () => {
    expect(refusal(risen(), { fiber: 'mod', generation: 7 }, 'f2')).toBe('other-predecessor')
  })

  it('备着的座位再放一批、还写着接替谁：不被自己这一份等着的挡住', () => {
    const more = put(staged(), 'f2', 'mod', [entry('host.one', 'j')], false, mod1)
    expect(more.kind).toBe('put')
  })

  it('fiber 还没就绪：拒绝', () => {
    expect(refusal(staged(), mod1, 'f2')).toBe('not-ready')
  })

  it('旧的实例不在位了：拒绝', () => {
    const left = gone(risen(), 'f1')
    const outcome = rollout(left, mod1, 'f2')
    expect(outcome).toMatchObject({ kind: 'refused', reason: 'old-not-seated' })
    expect(rollout(gone(risen(true), 'f1'), mod1, 'f2')).toMatchObject({
      kind: 'refused',
      reason: 'old-not-seated',
    })
  })

  it('换过之后旧的 fiber 才离开：什么都不做', () => {
    const outcome = rollout(risen(true), mod1, 'f2')
    if (outcome.kind !== 'rolled') throw new Error(outcome.detail)
    expect(gone(outcome.seats, 'f1')).toBe(outcome.seats)
  })
})

describe('DC-5：一步里没有两代同时在位，也没有一刻两代都不在位', () => {
  it('随机的备、就绪、换、丢、排空', () => {
    const random = randomOf(5)
    const walks = new Set<string>()
    for (let run = 0; run < 1500; run += 1) {
      let seats = served(below(random, 2) === 0)
      let serving = 'f1'
      let next = 2
      let standby: string | undefined
      const draining: [string, number][] = []
      const trace: string[] = []
      for (let turn = 0; turn < 20; turn += 1) {
        const action = below(random, 5)
        const before = seats
        if (action === 0 && standby === undefined) {
          const old = seats.seats.find(seat => seat.fiber === serving)!.instance
          const fiber = `f${String(next++)}`
          seats = must(seats, fiber, 'mod', [a2], below(random, 2) === 0, old).seats
          standby = fiber
          trace.push('s')
        } else if (action === 1 && standby !== undefined) {
          seats = ready(seats, standby)
          trace.push('r')
        } else if (action === 2 && standby !== undefined) {
          const old = seats.seats.find(seat => seat.fiber === serving)!
          const outcome = rollout(seats, old.instance, standby)
          trace.push(outcome.kind === 'rolled' ? 'X' : 'x')
          if (outcome.kind === 'rolled') {
            for (const batch of old.batches) if (batch.drains) draining.push([serving, batch.id])
            seats = outcome.seats
            serving = standby
            standby = undefined
          } else expect(outcome.reason).toBe('not-ready')
        } else if (action === 3 && standby !== undefined) {
          seats = gone(seats, standby)
          standby = undefined
          trace.push('g')
        } else if (action === 4 && draining.length > 0) {
          const [fiber, batch] = draining.shift()!
          seats = drained(seats, fiber, batch)
          trace.push('d')
        }
        // Exactly one generation of `mod` serves after every step, whatever the step was.
        expect(seats.registry.serving.filter(instance => instance.fiber === 'mod')).toHaveLength(1)
        if (trace.at(-1) !== 'X' && trace.at(-1) !== 'd')
          expect(seats.registry).toBe(before.registry)
      }
      // Whatever still drains is taken; then only the serving generation is on the registry.
      for (const [fiber, batch] of draining) seats = drained(seats, fiber, batch)
      expect(seats.registry.retiring).toEqual([])
      walks.add(trace.join(''))
    }
    console.log(`rollout walk: ${String(walks.size)} distinct walks of 1500`)
    expect(walks.size).toBeGreaterThan(700)
  })
})
