import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import {
  complete,
  declare,
  drain,
  empty,
  install,
  retire,
  type Instance,
  type Registry,
} from '@omne-harness/dynamis'
import { defineProtocol, ruleCodec, type ProtocolContract } from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'
import {
  busy,
  enter,
  entryOf,
  leave,
  noCalls,
  open,
  protocolsContract,
  type Calls,
} from '../src/registry/table.ts'

const body = ruleCodec({ kind: 'object', fields: {} })
const notes = defineProtocol({
  name: 'notes',
  major: 1,
  operations: {
    read: { identity: 'none', effect: 'read', limit: 'small', body, outcomes: { succeeded: body } },
  },
  observations: { watch: { identity: 'none', open: body, frame: body, ends: ['gone'] } },
})
const contribution = {
  protocol: notes,
  operations: { read: async () => ({ outcome: 'succeeded', body: {} }) },
  observations: { watch: async () => ({ outcome: 'unavailable' }) },
} as unknown as AccessContribution<ProtocolContract>

const host: Instance = { fiber: 'entry', generation: 1 }
const a1: Instance = { fiber: 'notes-access', generation: 1 }
const a2: Instance = { fiber: 'notes-access', generation: 2 }
const b1: Instance = { fiber: 'other-access', generation: 1 }
const KEY = 'notes/v1'

function installed(
  registry: Registry,
  instance: Instance,
  ...entries: ReturnType<typeof entryOf>[]
) {
  const outcome = install(registry, instance, entries)
  if (outcome.kind !== 'installed') throw new Error(outcome.detail)
  return outcome.registry
}

const declared = (): Registry => {
  const outcome = install(empty, host, [declare(protocolsContract)])
  if (outcome.kind !== 'installed') throw new Error(outcome.detail)
  return outcome.registry
}
const serving = (): Registry => installed(declared(), a1, entryOf(contribution, a1))
const clashing = (): Registry => installed(serving(), b1, entryOf(contribution, b1))

function mustEnter(registry: Registry, calls: Calls, name = 'read') {
  const outcome = enter(registry, calls, KEY, name)
  if (outcome.kind !== 'entered') throw new Error(`not entered: ${outcome.kind}`)
  return outcome
}

describe('点 access.protocols 的规矩', () => {
  it('每键至多一项，交带副作用的函数，同键多份答冲突，运行中能变', () => {
    expect(protocolsContract).toMatchObject({
      name: 'access.protocols',
      tree: 'server',
      arity: 'keyed-one',
      item: { kind: 'effect' },
      resolve: 'conflict',
      binding: 'run',
    })
    expect(install(empty, host, [declare(protocolsContract)]).kind).toBe('installed')
  })

  it('两个实例挂同一份协议：条目的摘要不同，所以是两项，不会并成一项', () => {
    expect(entryOf(contribution, a1).digest).not.toBe(entryOf(contribution, b1).digest)
    expect(entryOf(contribution, a1).digest).not.toBe(entryOf(contribution, a2).digest)
    expect(entryOf(contribution, a1)).toMatchObject({ point: 'access.protocols', key: KEY, id: '' })
  })
})

describe('进入', () => {
  it('没挂：not-mounted，账不变', () => {
    expect(enter(declared(), noCalls, KEY, 'read')).toEqual({ kind: 'not-mounted' })
  })

  it('点还没声明：也是 not-mounted', () => {
    expect(enter(empty, noCalls, KEY, 'read')).toEqual({ kind: 'not-mounted' })
  })

  it('一份在服务，有这个名字：进入，钉在那个实例上，账上多一次在跑的', () => {
    const outcome = mustEnter(serving(), noCalls)
    expect(outcome.instance).toEqual(a1)
    expect(outcome.member.kind).toBe('operation')
    expect(outcome.calls.ledger.calls).toEqual([
      { id: outcome.call, instance: a1, state: 'running', recorded: false },
    ])
    expect(mustEnter(serving(), noCalls, 'watch').member.kind).toBe('observation')
  })

  it('一份在服务，没有这个名字：not-offered，账不变', () => {
    expect(enter(serving(), noCalls, KEY, 'nope')).toEqual({ kind: 'not-offered' })
  })

  it('名字取自请求：对象原型上的名字不算有', () => {
    expect(enter(serving(), noCalls, KEY, 'toString')).toEqual({ kind: 'not-offered' })
    expect(enter(serving(), noCalls, KEY, '__proto__')).toEqual({ kind: 'not-offered' })
  })

  it('两份在：冲突，写明是哪两家，两份都不被调用，账不变', () => {
    expect(enter(clashing(), noCalls, KEY, 'read')).toEqual({ kind: 'conflict', by: [a1, b1] })
  })

  it('两份在，一份撤了：另一份立刻服务', () => {
    const outcome = mustEnter(retire(clashing(), a1), noCalls)
    expect(outcome.instance).toEqual(b1)
  })

  it('撤下中：not-mounted，不接新的', () => {
    expect(enter(retire(serving(), a1), noCalls, KEY, 'read')).toEqual({ kind: 'not-mounted' })
  })

  it('旧的一代撤下中、新的一代在服务：进入新的一代', () => {
    const registry = installed(retire(serving(), a1), a2, entryOf(contribution, a2))
    expect(mustEnter(registry, noCalls).instance).toEqual(a2)
  })

  it('每次进入的调用标识不同', () => {
    const first = mustEnter(serving(), noCalls)
    const second = mustEnter(serving(), first.calls)
    expect(second.call).not.toBe(first.call)
    expect(second.calls.ledger.calls).toHaveLength(2)
  })
})

describe('离开', () => {
  it('在跑的离开：账上没有它了', () => {
    const entered = mustEnter(serving(), noCalls)
    expect(leave(entered.calls, entered.call).ledger.calls).toEqual([])
  })

  it('离开两次、离开一个不认识的：什么都不变', () => {
    const entered = mustEnter(serving(), noCalls)
    const once = leave(entered.calls, entered.call)
    expect(leave(once, entered.call)).toBe(once)
    expect(leave(entered.calls, 'nope')).toBe(entered.calls)
  })
})

describe('撤下与排空', () => {
  it('撤下中有在跑的：这份协议名下还忙，登记表报正在排空，取不走', () => {
    const entered = mustEnter(serving(), noCalls)
    const registry = retire(serving(), a1)
    expect(busy(entered.calls, a1, KEY)).toBe(true)
    expect(drain(registry, entered.calls.ledger, a1)).toEqual({
      kind: 'draining',
      running: [entered.call],
    })
    expect(complete(registry, entered.calls.ledger, a1)).toEqual({
      kind: 'refused',
      reason: 'in-flight',
    })
  })

  it('撤下中最后一个在跑的离开：不忙了，取得走，登记表里没有它', () => {
    const entered = mustEnter(serving(), noCalls)
    const registry = retire(serving(), a1)
    const after = leave(entered.calls, entered.call)
    expect(busy(after, a1, KEY)).toBe(false)
    const outcome = complete(registry, after.ledger, a1)
    expect(outcome).toEqual({ kind: 'withdrawn', registry: declared() })
  })

  it('忙不忙按「实例加协议」分：别的协议、别的实例名下在跑的不算', () => {
    const entered = mustEnter(serving(), noCalls)
    expect(busy(entered.calls, a1, 'other/v1')).toBe(false)
    expect(busy(entered.calls, a2, KEY)).toBe(false)
    expect(busy(entered.calls, a1, 'notes/v10')).toBe(false)
  })

  it('主版本 10 名下在跑的，不算主版本 1 的', () => {
    const ten = { ...contribution, protocol: { ...notes, major: 10 } } as typeof contribution
    const registry = installed(declared(), a1, entryOf(contribution, a1), entryOf(ten, a1))
    const entered = enter(registry, noCalls, 'notes/v10', 'read')
    if (entered.kind !== 'entered') throw new Error(entered.kind)
    expect(busy(entered.calls, a1, 'notes/v10')).toBe(true)
    expect(busy(entered.calls, a1, KEY)).toBe(false)
  })

  it('在跑的调用还在撤下中的实例上离开：照常', () => {
    const entered = mustEnter(serving(), noCalls)
    expect(leave(entered.calls, entered.call).ledger.calls).toEqual([])
  })
})

describe('对外可用的集合', () => {
  it('没挂是空的；一份在服务有它；撤下中没有；两份在记成冲突', () => {
    expect(open(declared())).toEqual({ protocols: [], conflicts: [] })
    expect(open(serving())).toEqual({
      protocols: [{ key: KEY, name: 'notes', major: 1, revision: 1 }],
      conflicts: [],
    })
    expect(open(retire(serving(), a1))).toEqual({ protocols: [], conflicts: [] })
    expect(open(clashing())).toEqual({
      protocols: [],
      conflicts: [{ key: KEY, name: 'notes', major: 1 }],
    })
  })

  it('点没声明：空的', () => {
    expect(open(empty)).toEqual({ protocols: [], conflicts: [] })
  })
})
