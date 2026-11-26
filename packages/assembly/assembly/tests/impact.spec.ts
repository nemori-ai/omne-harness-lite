import { describe, expect, it } from 'vitest'
import { declareRow, planChange, type Change, type RowSpec } from '../src/index.ts'

type Random = () => number
function randomOf(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}
const below = (random: Random, limit: number): number => Math.floor(random() * limit)

const row = (
  name: string,
  provides: readonly string[],
  injects: readonly string[],
  swap?: RowSpec['swap'],
  digest = 'd1',
): RowSpec =>
  declareRow({
    name,
    provides,
    injects,
    ...(swap === undefined ? {} : { swap }),
    contracts: Object.fromEntries(provides.map(key => [key, digest])),
  })

/** storage ← identity ← session ← access; calendar reads storage; usage is a leaf beside them. */
const chain = (swap: RowSpec['swap'] = 'rerun'): RowSpec[] => [
  row('storage', ['storage'], [], swap),
  row('identity', ['identity'], ['storage'], swap),
  row('session', ['sessions'], ['identity', 'storage'], swap),
  row('access', [], ['sessions'], swap),
  row('calendar', ['calendar'], ['storage'], swap),
  row('usage', [], [], swap),
]
const replace = (
  graph: readonly RowSpec[],
  name: string,
  change: Partial<RowSpec> = {},
): Change => {
  const now = graph.find(each => each.name === name) as RowSpec
  return { kind: 'replace', row: name, next: { ...now, ...change } }
}

describe('行的声明', () => {
  it('不写换法就是换进程；不写的清单是空的', () => {
    expect(declareRow({ name: 'usage' })).toEqual({
      name: 'usage',
      layer: 'official',
      provides: [],
      injects: [],
      swap: 'restart',
      contracts: {},
    })
  })
})

describe('planChange：一次变更走哪一档、让哪些行重跑', () => {
  it('规则 1：换实现，契约同形，这一行声明了换实现：没有一行重跑', () => {
    const graph = chain('implementation')
    expect(planChange(graph, replace(graph, 'identity'))).toEqual({
      kind: 'impact',
      way: 'implementation',
      reruns: [],
      reasons: [],
    })
  })

  it('规则 2：这一行只声明了重跑：它与依赖闭包重跑，按依赖次序', () => {
    const graph = chain('rerun')
    expect(planChange(graph, replace(graph, 'identity'))).toEqual({
      kind: 'impact',
      way: 'rerun',
      reruns: ['identity', 'session', 'access'],
      reasons: ['row-reruns:identity'],
    })
  })

  it('规则 2：闭包走到不动点，不止一层', () => {
    const graph = chain('rerun')
    expect(planChange(graph, replace(graph, 'storage'))).toMatchObject({
      way: 'rerun',
      reruns: ['storage', 'identity', 'session', 'access', 'calendar'],
    })
  })

  it('新旧两份声明里有一份不是换实现，就不是换实现', () => {
    const graph = chain('implementation')
    expect(planChange(graph, replace(graph, 'calendar', { swap: 'rerun' }))).toEqual({
      kind: 'impact',
      way: 'rerun',
      reruns: ['calendar'],
      reasons: ['row-reruns:calendar'],
    })
  })

  it('规则 3：重跑的行里有一行只能换进程：整次走换进程，原因点名', () => {
    const graph = chain('rerun').map(each =>
      each.name === 'session' ? { ...each, swap: 'restart' as const } : each,
    )
    expect(planChange(graph, replace(graph, 'identity'))).toEqual({
      kind: 'impact',
      way: 'restart',
      reruns: ['identity', 'session', 'access'],
      reasons: ['row-reruns:identity', 'restart-only:session'],
    })
  })

  it('规则 4：摘要变了，声明了换实现也要重跑，注入这个键的行都在里面', () => {
    const graph = chain('implementation')
    const next = { contracts: { identity: 'd2' } }
    expect(planChange(graph, replace(graph, 'identity', next))).toEqual({
      kind: 'impact',
      way: 'rerun',
      reruns: ['identity', 'session', 'access'],
      reasons: ['contract-changed:identity'],
    })
  })

  it('规则 4：多提供一个键，等着这个键的行也算进来', () => {
    const graph = [...chain('implementation'), row('waiter', [], ['clock'], 'implementation')]
    const next = { provides: ['calendar', 'clock'], contracts: { calendar: 'd1', clock: 'd1' } }
    expect(planChange(graph, replace(graph, 'calendar', next))).toEqual({
      kind: 'impact',
      way: 'rerun',
      reruns: ['calendar', 'waiter'],
      reasons: ['contract-changed:clock'],
    })
  })

  it('新的一份注入的键不一样：不是换实现', () => {
    const graph = chain('implementation')
    expect(
      planChange(graph, replace(graph, 'calendar', { injects: ['storage', 'identity'] })),
    ).toEqual({
      kind: 'impact',
      way: 'rerun',
      reruns: ['calendar'],
      reasons: ['injects-changed:calendar'],
    })
  })

  it('一行没了：依赖它的行被带走，它自己不在重跑的行里', () => {
    const graph = chain('rerun')
    expect(planChange(graph, { kind: 'lost', row: 'identity' })).toEqual({
      kind: 'impact',
      way: 'rerun',
      reruns: ['session', 'access'],
      reasons: ['row-lost:identity'],
    })
  })

  it('一行没了，它自己或带走的行里有只能换进程的：走换进程', () => {
    const graph = chain('restart')
    expect(planChange(graph, { kind: 'lost', row: 'calendar' })).toEqual({
      kind: 'impact',
      way: 'restart',
      reruns: [],
      reasons: ['row-lost:calendar', 'restart-only:calendar'],
    })
    expect(planChange(graph, { kind: 'lost', row: 'identity' })).toMatchObject({
      way: 'restart',
      reasons: [
        'row-lost:identity',
        'restart-only:identity',
        'restart-only:session',
        'restart-only:access',
      ],
    })
  })

  it('一行回来了：它与依赖闭包一起起来', () => {
    const graph = chain('rerun')
    expect(planChange(graph, { kind: 'returned', row: 'identity' })).toEqual({
      kind: 'impact',
      way: 'rerun',
      reruns: ['identity', 'session', 'access'],
      reasons: ['row-returned:identity'],
    })
  })

  it('规则 5：图里有环：拒绝，写明环上的行', () => {
    const graph = [row('a', ['ka'], ['kc']), row('b', ['kb'], ['ka']), row('c', ['kc'], ['kb'])]
    expect(planChange(graph, { kind: 'lost', row: 'a' })).toEqual({
      kind: 'refused',
      reason: 'cycle',
      detail: ['a', 'b', 'c'],
    })
  })

  it('换上去的声明让图成了环：拒绝', () => {
    const graph = chain('rerun')
    expect(planChange(graph, replace(graph, 'storage', { injects: ['sessions'] }))).toEqual({
      kind: 'refused',
      reason: 'cycle',
      detail: ['storage', 'identity', 'session'],
    })
  })

  it('图外的行、名字对不上的声明、重名的行、两行提供同一个键：拒绝', () => {
    const graph = chain()
    expect(planChange(graph, { kind: 'lost', row: 'nobody' })).toEqual({
      kind: 'refused',
      reason: 'unknown-row',
      detail: ['nobody'],
    })
    const other = { ...(graph[1] as RowSpec), name: 'other' }
    expect(planChange(graph, { kind: 'replace', row: 'identity', next: other })).toEqual({
      kind: 'refused',
      reason: 'name-mismatch',
      detail: ['identity', 'other'],
    })
    expect(planChange([...graph, row('usage', [], [])], { kind: 'lost', row: 'usage' })).toEqual({
      kind: 'refused',
      reason: 'duplicate-row',
      detail: ['usage'],
    })
    expect(
      planChange([...graph, row('rival', ['storage'], [])], { kind: 'lost', row: 'usage' }),
    ).toEqual({
      kind: 'refused',
      reason: 'duplicate-provider',
      detail: ['storage', 'storage', 'rival'],
    })
    expect(planChange(graph, replace(graph, 'usage', { provides: ['storage'] }))).toEqual({
      kind: 'refused',
      reason: 'duplicate-provider',
      detail: ['storage', 'storage', 'usage'],
    })
  })
})

/** A random graph without a cycle: a row injects only keys of rows before it in a hidden order. */
function randomGraph(random: Random): RowSpec[] {
  const size = 2 + below(random, 9)
  const rows: RowSpec[] = []
  const keys: string[] = []
  for (let index = 0; index < size; index += 1) {
    const provides = Array.from(
      { length: below(random, 3) },
      (_, n) => `k${String(index)}.${String(n)}`,
    )
    const injects = keys.filter(() => random() < 0.3)
    const swap = (['implementation', 'rerun', 'restart'] as const)[below(random, 3)] ?? 'restart'
    rows.push(row(`r${String(index)}`, provides, injects, swap))
    keys.push(...provides)
  }
  // The declared order is not the dependency order.
  for (let index = rows.length - 1; index > 0; index -= 1) {
    const other = below(random, index + 1)
    ;[rows[index], rows[other]] = [rows[other] as RowSpec, rows[index] as RowSpec]
  }
  return rows
}

/**
 * The rule of Cordis, written the slow way and apart from the code under test: a fiber whose provider is unloaded is
 * unloaded, wave after wave, until a wave unloads nothing.
 */
function unloadedByWaves(
  graph: readonly RowSpec[],
  first: readonly string[],
  keys: readonly string[],
): Set<string> {
  const down = new Set(first)
  const gone = new Set(keys)
  for (let moved = true; moved;) {
    moved = false
    for (const each of graph) {
      if (down.has(each.name) || !each.injects.some(key => gone.has(key))) continue
      down.add(each.name)
      for (const key of each.provides) gone.add(key)
      moved = true
    }
  }
  return down
}

describe('AS-15：预演的重跑等于照 Cordis 的规矩实际会重跑的', () => {
  it('随机的无环图与随机的变更', () => {
    const random = randomOf(20261126)
    const seen = new Set<string>()
    const ways = new Map<string, number>()
    for (let run = 0; run < 3000; run += 1) {
      const graph = randomGraph(random)
      const target = graph[below(random, graph.length)] as RowSpec
      const kinds = ['replace', 'replace-reshaped', 'lost', 'returned'] as const
      const kind = kinds[below(random, 4)] ?? 'lost'
      const reshaped = {
        ...target,
        contracts: Object.fromEntries(target.provides.map(key => [key, 'd2'])),
      }
      const change: Change =
        kind === 'replace'
          ? { kind: 'replace', row: target.name, next: target }
          : kind === 'replace-reshaped'
            ? { kind: 'replace', row: target.name, next: reshaped }
            : { kind, row: target.name }
      seen.add(JSON.stringify([graph, change]))
      const impact = planChange(graph, change)
      if (impact.kind !== 'impact') throw new Error(`refused: ${JSON.stringify(impact)}`)
      ways.set(impact.way, (ways.get(impact.way) ?? 0) + 1)
      const inPlace =
        change.kind === 'replace' &&
        target.swap === 'implementation' &&
        (kind === 'replace' || target.provides.length === 0)
      const expected = inPlace
        ? new Set<string>()
        : unloadedByWaves(graph, [target.name], target.provides)
      if (change.kind === 'lost') expected.delete(target.name)
      expect(new Set(impact.reruns)).toEqual(expected)
      // In dependency order: nothing reruns before a row it injects from.
      const place = new Map(impact.reruns.map((name, index) => [name, index]))
      for (const each of graph) {
        const at = place.get(each.name)
        if (at === undefined) continue
        for (const provider of graph)
          if (provider.provides.some(key => each.injects.includes(key)) && place.has(provider.name))
            expect(place.get(provider.name)).toBeLessThan(at)
      }
      const judged = change.kind === 'lost' ? [target.name, ...impact.reruns] : impact.reruns
      const restartOnly = judged.some(
        name => (graph.find(each => each.name === name) as RowSpec).swap === 'restart',
      )
      expect(impact.way).toBe(inPlace ? 'implementation' : restartOnly ? 'restart' : 'rerun')
    }
    console.log(
      `planChange property: ${String(seen.size)} distinct inputs of 3000; ways ${JSON.stringify([...ways])}`,
    )
    expect(seen.size).toBeGreaterThan(2500)
  })
})
