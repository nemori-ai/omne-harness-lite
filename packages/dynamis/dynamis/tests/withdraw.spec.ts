import { describe, expect, it } from 'vitest'
import {
  admit,
  complete,
  drain,
  empty,
  finish,
  lost,
  noCalls,
  reconcile,
  record,
  remove,
  retire,
  settled,
  standing,
  type Ledger,
  type Registry,
} from '../src/index.ts'
import { entry, inst, mustInstall } from './support.ts'

const a = inst('a')
const b = inst('b')
const serving: Registry = mustInstall(mustInstall(empty, a, [entry('host.point', 'k')]), b, [])

function admitted(registry: Registry, ledger: Ledger, id: string, instance = a): Ledger {
  const outcome = admit(registry, ledger, instance, id)
  if (outcome.kind !== 'admitted') throw new Error(`not admitted: ${outcome.kind}`)
  return outcome.ledger
}
const moved = (outcome: { kind: string; ledger?: Ledger }): Ledger => {
  if (outcome.ledger === undefined) throw new Error(`refused: ${outcome.kind}`)
  return outcome.ledger
}
const running = admitted(serving, noCalls, 'c1')
const done = moved(finish(running, 'c1'))
const unknownRecorded = lost(moved(record(running, 'c1')), a)
const unknownBare = lost(running, a)
const stateOf = (ledger: Ledger, id = 'c1') => {
  const call = ledger.calls.find(one => one.id === id)
  return call === undefined ? 'missing' : `${call.state}${call.recorded ? '+recorded' : ''}`
}

describe('admit：受理时把调用钉在一个在服务的实例上', () => {
  it('实例在服务：受理，账上多一条在跑的', () => {
    expect(running).toEqual({
      calls: [{ id: 'c1', instance: a, state: 'running', recorded: false }],
    })
    expect(noCalls).toEqual({ calls: [] })
  })

  it('实例正在撤下：拒绝 retiring', () => {
    expect(admit(retire(serving, a), noCalls, a, 'c1')).toEqual({
      kind: 'refused',
      reason: 'retiring',
    })
  })

  it('实例不在：拒绝 absent', () => {
    expect(admit(serving, noCalls, inst('nobody'), 'c1')).toEqual({
      kind: 'refused',
      reason: 'absent',
    })
  })

  it('同一个调用标识再来，钉的是同一个实例：认回，账不变，哪怕它已经在撤下或完成', () => {
    expect(admit(serving, running, a, 'c1')).toEqual({ kind: 'recognised', ledger: running })
    expect(admit(retire(serving, a), done, a, 'c1')).toEqual({ kind: 'recognised', ledger: done })
  })

  it('同一个调用标识再来，钉的是别的实例：拒绝 call-in-use', () => {
    expect(admit(serving, running, b, 'c1')).toEqual({ kind: 'refused', reason: 'call-in-use' })
    expect(admit(serving, running, inst('a', 2), 'c1')).toEqual({
      kind: 'refused',
      reason: 'call-in-use',
    })
  })

  it('账按调用标识排，和受理的先后无关', () => {
    const forward = admitted(serving, admitted(serving, noCalls, 'c1'), 'c2', b)
    const backward = admitted(serving, admitted(serving, noCalls, 'c2', b), 'c1')
    expect(forward).toEqual(backward)
    expect(forward.calls.map(call => call.id)).toEqual(['c1', 'c2'])
    expect(Object.isFrozen(forward) && Object.isFrozen(forward.calls)).toBe(true)
  })
})

describe('一次调用的状态乘四个操作', () => {
  it('在跑：record 记下已耐久；finish 变完成并记已耐久；lost 变未知；reconcile 不变', () => {
    expect(stateOf(moved(record(running, 'c1')))).toBe('running+recorded')
    expect(stateOf(moved(finish(running, 'c1')))).toBe('done+recorded')
    expect(stateOf(lost(running, a))).toBe('unknown')
    expect(reconcile(running, 'c1')).toEqual({ kind: 'known', state: 'running', ledger: running })
  })

  it('完成：四个操作都不改它', () => {
    expect(record(done, 'c1')).toEqual({ kind: 'moved', ledger: done })
    expect(finish(done, 'c1')).toEqual({ kind: 'moved', ledger: done })
    expect(moved(record(done, 'c1'))).toBe(done)
    expect(moved(finish(done, 'c1'))).toBe(done)
    expect(lost(done, a)).toEqual(done)
    expect(reconcile(done, 'c1')).toEqual({ kind: 'known', state: 'done', ledger: done })
  })

  it('未知、已耐久：record 与 finish 拒绝；lost 不变；reconcile 认回成完成', () => {
    expect(stateOf(unknownRecorded)).toBe('unknown+recorded')
    expect(record(unknownRecorded, 'c1')).toEqual({ kind: 'refused', reason: 'not-running' })
    expect(finish(unknownRecorded, 'c1')).toEqual({ kind: 'refused', reason: 'not-running' })
    expect(lost(unknownRecorded, a)).toEqual(unknownRecorded)
    const outcome = reconcile(unknownRecorded, 'c1')
    expect(outcome.kind === 'known' && outcome.state).toBe('done')
    expect(stateOf(moved(outcome))).toBe('done+recorded')
  })

  it('未知、没耐久：record 与 finish 拒绝；reconcile 答仍未知，不重做', () => {
    expect(record(unknownBare, 'c1')).toEqual({ kind: 'refused', reason: 'not-running' })
    expect(finish(unknownBare, 'c1')).toEqual({ kind: 'refused', reason: 'not-running' })
    expect(reconcile(unknownBare, 'c1')).toEqual({ kind: 'still-unknown', ledger: unknownBare })
  })

  it('没有这次调用：都拒绝 no-such-call', () => {
    const refused = { kind: 'refused', reason: 'no-such-call' }
    expect([record(running, 'c9'), finish(running, 'c9'), reconcile(running, 'c9')]).toEqual([
      refused,
      refused,
      refused,
    ])
  })

  it('lost 只动这个实例名下在跑的', () => {
    const both = admitted(serving, admitted(serving, running, 'c2', b), 'c3')
    const after = lost(moved(finish(both, 'c3')), a)
    expect([stateOf(after, 'c1'), stateOf(after, 'c2'), stateOf(after, 'c3')]).toEqual([
      'unknown',
      'running',
      'done+recorded',
    ])
    expect(lost(running, inst('a', 2))).toEqual(running)
  })

  it('一个操作只动一次调用', () => {
    const both = admitted(serving, running, 'c2', b)
    expect(stateOf(moved(finish(both, 'c1')), 'c2')).toBe('running')
    expect(stateOf(moved(record(both, 'c2')), 'c1')).toBe('running')
  })
})

describe('drain 与 complete：排空到哪一步', () => {
  const retiring = retire(serving, a)

  it('在服务：drain 报在服务；complete 拒绝 not-retiring', () => {
    expect(drain(serving, running, a)).toEqual({ kind: 'serving' })
    expect(complete(serving, noCalls, a)).toEqual({ kind: 'refused', reason: 'not-retiring' })
  })

  it('正在撤下，还有在跑的：drain 列出它们；complete 拒绝 in-flight', () => {
    const two = admitted(serving, admitted(serving, running, 'c3'), 'c2', b)
    expect(drain(retiring, two, a)).toEqual({ kind: 'draining', running: ['c1', 'c3'] })
    expect(complete(retiring, two, a)).toEqual({ kind: 'refused', reason: 'in-flight' })
  })

  it('正在撤下，排空了：drain 报排空；complete 取走它', () => {
    const others = admitted(serving, done, 'c2', b)
    expect(drain(retiring, others, a)).toEqual({ kind: 'drained' })
    const outcome = complete(retiring, others, a)
    expect(outcome).toEqual({ kind: 'withdrawn', registry: remove(serving, a) })
    expect(outcome.kind === 'withdrawn' && standing(outcome.registry, b)).toBe('serving')
  })

  it('不在：drain 列出它名下未知的；complete 不变', () => {
    const gone = remove(serving, a)
    const calls = lost(admitted(serving, running, 'c2', b), a)
    expect(drain(gone, calls, a)).toEqual({ kind: 'absent', unknown: ['c1'] })
    expect(drain(gone, noCalls, a)).toEqual({ kind: 'absent', unknown: [] })
    expect(complete(gone, calls, a)).toEqual({ kind: 'withdrawn', registry: gone })
  })
})

describe('settled：把完成的从账上拿掉', () => {
  it('完成的走，在跑的与未知的留', () => {
    const three = admitted(serving, admitted(serving, running, 'c2', b), 'c3')
    const mixed = lost(moved(finish(three, 'c3')), b)
    expect(settled(mixed).calls.map(call => `${call.id}:${call.state}`)).toEqual([
      'c1:running',
      'c2:unknown',
    ])
    expect(settled(noCalls)).toEqual(noCalls)
  })
})
