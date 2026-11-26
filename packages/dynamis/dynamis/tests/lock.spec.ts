import { describe, expect, it } from 'vitest'
import { ask, declare, list, report, type Entry, type Registry, type Scope } from '../src/index.ts'
import { below, contract, entry, inst, pick, randomOf, registryOf } from './support.ts'

const ORG: Scope = ['org-a']
const TENANT: Scope = ['org-a', 'alice']
const OTHER: Scope = ['org-b', 'bob']

const points = (
  resolve: 'conflict' | 'most-specific',
  arity: 'keyed-one' | 'keyed-list' = 'keyed-one',
) => ['host', [declare(contract('memory.stores', { resolve, arity }))]] as const
const put = (digest: string, over: Partial<Entry> = {}): Entry =>
  entry('memory.stores', 'graph', { digest, ...over })
const official = put('official', { lock: true })
const kindOf = (registry: Registry, asker: Scope): string => {
  const answer = ask(registry, 'memory.stores', 'graph', asker)
  return answer.kind === 'one' ? `one:${answer.entry.digest}` : answer.kind
}

describe('条目的锁：带锁的条目所在的键上，更深作用域的条目出局', () => {
  it('只放一项的点：租户放同键的，官方的那一项对谁都照常，租户的写明被哪一份锁住', () => {
    const registry = registryOf(
      points('conflict'),
      ['usage', [official]],
      ['plugin:rival', [put('rival', { scope: TENANT })]],
    )
    for (const asker of [[], ORG, TENANT, OTHER])
      expect(kindOf(registry, asker)).toBe('one:official')
    const answer = ask(registry, 'memory.stores', 'graph', TENANT)
    expect(answer.kind === 'one' && answer.filtered).toEqual([
      expect.objectContaining({ reason: 'locked', detail: 'usage' }),
    ])
  })

  it('不带锁时照旧：只放一项的点答冲突，最具体胜出的点被租户盖过', () => {
    const plain = put('official')
    const rival = ['plugin:rival', [put('rival', { scope: TENANT })]] as const
    expect(kindOf(registryOf(points('conflict'), ['usage', [plain]], rival), TENANT)).toBe(
      'conflict',
    )
    expect(kindOf(registryOf(points('most-specific'), ['usage', [plain]], rival), TENANT)).toBe(
      'one:rival',
    )
  })

  it('最具体胜出的点：带锁的官方条目不被更深的盖过', () => {
    const registry = registryOf(
      points('most-specific'),
      ['usage', [official]],
      ['plugin:rival', [put('rival', { scope: TENANT })]],
    )
    expect(kindOf(registry, TENANT)).toBe('one:official')
  })

  it('一列的点：带锁的那一项留在列里，更深的同键条目不进列也不算冲突', () => {
    const registry = registryOf(
      points('conflict', 'keyed-list'),
      ['usage', [official]],
      ['plugin:rival', [put('rival', { scope: TENANT })]],
    )
    const read = list(registry, 'memory.stores', null, TENANT)
    expect(read.kind === 'read' && read.items.map(item => item.entry.digest)).toEqual(['official'])
    expect(read.kind === 'read' && read.conflicts).toEqual([])
    expect(read.kind === 'read' && read.filtered.map(out => [out.reason, out.detail])).toEqual([
      ['locked', 'usage'],
    ])
  })

  it('锁只对更深的作用域起作用：同层的另一份照旧是冲突，更浅的不受它管', () => {
    const sameLayer = registryOf(points('conflict'), ['usage', [official]], ['twin', [put('twin')]])
    expect(kindOf(sameLayer, TENANT)).toBe('conflict')
    const lockedByTenant = registryOf(
      points('most-specific'),
      ['usage', [put('official')]],
      ['plugin:mine', [put('mine', { scope: TENANT, lock: true })]],
    )
    expect(kindOf(lockedByTenant, [])).toBe('one:official')
    expect(kindOf(lockedByTenant, TENANT)).toBe('one:mine')
  })

  it('租户给自己的条目加锁：只锁住比它更深的那几层', () => {
    const registry = registryOf(
      points('most-specific'),
      ['plugin:mine', [put('mine', { scope: TENANT, lock: true })]],
      ['skin', [put('skin', { scope: [...TENANT, 'skin'] })]],
    )
    expect(kindOf(registry, [...TENANT, 'skin'])).toBe('one:mine')
  })

  it('两层都带锁：取最浅的那一层', () => {
    const registry = registryOf(
      points('most-specific'),
      ['usage', [official]],
      ['org', [put('org', { scope: ORG, lock: true })]],
      ['plugin:rival', [put('rival', { scope: TENANT })]],
    )
    const answer = ask(registry, 'memory.stores', 'graph', TENANT)
    expect(answer.kind === 'one' && answer.entry.digest).toBe('official')
    expect(answer.kind === 'one' && answer.filtered.map(out => out.entry.digest).sort()).toEqual([
      'org',
      'rival',
    ])
  })

  it('另一个键不受这把锁管', () => {
    const registry = registryOf(
      points('conflict'),
      ['usage', [official]],
      ['plugin:other', [entry('memory.stores', 'vector', { digest: 'vector', scope: TENANT })]],
    )
    const answer = ask(registry, 'memory.stores', 'vector', TENANT)
    expect(answer.kind === 'one' && answer.entry.digest).toBe('vector')
  })

  it('回执：被锁住的那一份读到 locked 与锁它的是谁；官方的那一份照常生效', () => {
    const registry = registryOf(
      points('conflict'),
      ['usage', [official]],
      ['plugin:rival', [put('rival', { scope: TENANT })]],
    )
    expect(report(registry, inst('plugin:rival')).map(one => [one.state, one.detail])).toEqual([
      ['locked', 'usage'],
    ])
    expect(report(registry, inst('usage')).map(one => [one.state, one.detail])).toEqual([
      ['effective', ''],
    ])
  })
})

describe('DY-16：带锁的键上，任取更深作用域的条目加进来或拿走，对任何发问者的答案不变', () => {
  it('随机的层、随机的条目、随机的发问者', () => {
    const random = randomOf(16)
    const scopes: Scope[] = [[], ORG, TENANT, [...TENANT, 'skin'], OTHER, ['org-b']]
    const seen = new Set<string>()
    let lockedRuns = 0
    for (let run = 0; run < 3000; run += 1) {
      const resolve = pick(random, ['conflict', 'most-specific'] as const)
      const arity = pick(random, ['keyed-one', 'keyed-list'] as const)
      const lockAt = pick(random, scopes)
      const base: Entry[] = [put('locked', { scope: lockAt, lock: true })]
      // What stands at the layer of the lock or above it, or beside it, is part of the base.
      const extras: Entry[] = []
      for (let n = 1 + below(random, 6); n > 0; n -= 1) {
        const scope = pick(random, scopes)
        const made = put(`e${String(n)}-${String(below(random, 3))}`, {
          scope,
          ...(random() < 0.2 ? { lock: true as const } : {}),
        })
        const deeper =
          scope.length > lockAt.length && lockAt.every((part, at) => part === scope[at])
        ;(deeper ? extras : base).push(made)
      }
      const without = registryOf(
        points(resolve, arity),
        ...base.map((each, n) => [`b${String(n)}`, [each]] as const),
      )
      const withThem = registryOf(
        points(resolve, arity),
        ...base.map((each, n) => [`b${String(n)}`, [each]] as const),
        ...extras.map((each, n) => [`x${String(n)}`, [each]] as const),
      )
      seen.add(JSON.stringify([resolve, arity, base, extras]))
      if (extras.length > 0) lockedRuns += 1
      for (const asker of scopes) {
        // The answer without what was filtered out: who is out is not part of what stands.
        const stands = (registry: Registry): unknown => {
          const answer = ask(registry, 'memory.stores', 'graph', asker)
          const read = list(registry, 'memory.stores', null, asker)
          return [
            answer.kind === 'one'
              ? answer.entry.digest
              : answer.kind === 'conflict'
                ? answer.entries.map(e => e.digest)
                : answer.kind,
            read.kind === 'read'
              ? [
                  read.items.map(item => item.entry.digest),
                  read.conflicts.map(group => group.map(e => e.digest)),
                ]
              : read.kind,
          ]
        }
        expect(stands(withThem)).toEqual(stands(without))
      }
    }
    console.log(
      `lock property: ${String(seen.size)} distinct inputs of 3000, ${String(lockedRuns)} with deeper entries`,
    )
    expect(seen.size).toBeGreaterThan(2000)
    expect(lockedRuns).toBeGreaterThan(1000)
  })
})
