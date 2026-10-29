// 具名组环例外（schema 3 `groupCycleExceptions`）：成员边的字段校验、去掉登记边后重判的算法，以及回路状态硬线怎样读它。
// omne-deps 在 runner 与被检树分开的临时仓库上的行为在 group-cycle-exceptions-cli.spec.ts。
import { describe, expect, it } from 'vitest'
import { parseConstraints, semanticConstraints } from '../src/arch/constraints.ts'
import type {
  ArchitectureGroupCycleEdge,
  ArchitectureGroupCycleException,
} from '../src/arch/conformance-model.ts'
import { exceptedLine, judgeGroupCycles } from '../src/arch/group-cycles.ts'
import type { DependencyFinding } from '../src/deps/graph.ts'
import { directionLines } from '../src/loop/run.ts'
import { hardLineLines, hardLinesBroken } from '../src/loop/status.ts'

const RULING = 'https://github.com/nemori-ai/omne-harness-lite/issues/675#issuecomment-6480475331'

const A1 = 'packages/a/one'
const A2 = 'packages/a/two'
const B1 = 'packages/b/one'
const C1 = 'packages/c/one'
const edge = (from: string, to: string): ArchitectureGroupCycleEdge => ({ from, to })
const exception = (
  id: string,
  first: ArchitectureGroupCycleEdge,
  ...rest: ArchitectureGroupCycleEdge[]
): ArchitectureGroupCycleException => ({
  id,
  edges: [first, ...rest],
  ruling: RULING,
  reason: '上下文组装感知工具',
})

function document(rows: unknown, schemaVersion: 1 | 2 | 3 = 3): string {
  return JSON.stringify({
    schemaVersion,
    domains: [],
    roles: [],
    rules: [],
    ...(rows === undefined ? {} : { groupCycleExceptions: rows }),
  })
}
const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'GCX-CONTEXT-TOOL',
  edges: [
    { from: 'packages/context/request-context-contract', to: 'packages/tool/tool-contract' },
    { from: 'packages/tool/tool-contract', to: 'packages/context/runtime-context-contract' },
  ],
  ruling: RULING,
  reason: '上下文组装感知工具，工具感知运行时上下文',
  ...overrides,
})

describe('groupCycleExceptions 的校验', () => {
  it('schema 3 读出例外与成员边；缺省时没有例外', () => {
    expect(parseConstraints(document([row()])).groupCycleExceptions).toEqual([row()])
    expect(parseConstraints(document(undefined)).groupCycleExceptions).toEqual([])
  })

  it('schema 1、2 带这个字段按未知字段拒绝', () => {
    for (const version of [1, 2] as const)
      expect(() => parseConstraints(document([row()], version))).toThrow(
        'unknown fields: groupCycleExceptions',
      )
  })

  const same = { from: 'packages/context/a', to: 'packages/context/b' }
  const one = { from: 'packages/context/a', to: 'packages/tool/b' }
  const other = { from: 'packages/tool/b', to: 'packages/context/a' }
  it.each([
    ['不是数组', null, 'require arrays'],
    ['多出字段', [row({ source: 'docs/x.md' })], 'unknown fields: source'],
    ['缺理由', [row({ reason: undefined })], 'nonempty strings'],
    ['缺 edges', [row({ edges: undefined })], 'require arrays'],
    ['edges 为空', [row({ edges: [] })], 'at least one edge'],
    [
      '旧的 groups 字段',
      [row({ groups: ['packages/context', 'packages/tool'] })],
      'unknown fields: groups',
    ],
    [
      '只有旧的 groups 字段',
      [{ ...row({ edges: undefined }), groups: ['apps', 'examples'] }],
      'unknown fields: groups',
    ],
    ['边多出字段', [row({ edges: [{ ...one, note: 'x' }] })], 'unknown fields: note'],
    ['边缺 to', [row({ edges: [{ from: one.from }] })], 'nonempty strings'],
    ['同组的边', [row({ edges: [same] })], 'across groups'],
    ['两端是同一个成员', [row({ edges: [{ from: one.from, to: one.from }] })], 'across groups'],
    [
      '边的端点是组键不是成员',
      [row({ edges: [{ from: 'packages/context', to: one.to }] })],
      'member paths',
    ],
    [
      '边的端点在成员之内',
      [row({ edges: [{ from: 'packages/context/a/src', to: one.to }] })],
      'member paths',
    ],
    [
      '边的端点有 ..',
      [row({ edges: [{ from: 'packages/context/..', to: one.to }] })],
      'Invalid architecture path',
    ],
    ['同一例外里重复的边', [row({ edges: [one, one] })], 'repeat an edge'],
    [
      '不同例外里重复的边',
      [row({ edges: [one] }), row({ id: 'GCX-OTHER', edges: [one, other] })],
      'repeat an edge',
    ],
    ['裁定不是链接', [row({ ruling: 'docs/x.md' })], 'https ruling link'],
    ['裁定不是 https', [row({ ruling: 'http://example.com/x' })], 'https ruling link'],
    ['id 重复', [row(), row({ edges: [other] })], 'duplicate identities'],
  ])('%s时拒绝', (_label, rows, message) => {
    expect(() => parseConstraints(document(rows))).toThrow(message)
  })

  it('同一对成员的反向边是另一条边，可以分属两条例外', () => {
    const one = { from: 'packages/context/a', to: 'packages/tool/b' }
    const back = { from: 'packages/tool/b', to: 'packages/context/a' }
    expect(
      parseConstraints(document([row({ edges: [one] }), row({ id: 'GCX-BACK', edges: [back] })]))
        .groupCycleExceptions,
    ).toHaveLength(2)
  })

  it('例外参与语义比较：增删一条或一条边是语义变化，边的书写顺序不是', () => {
    const none = semanticConstraints(parseConstraints(document(undefined)))
    const both = semanticConstraints(parseConstraints(document([row()])))
    const reordered = semanticConstraints(
      parseConstraints(document([row({ edges: [...row().edges].reverse() })])),
    )
    const fewer = semanticConstraints(
      parseConstraints(document([row({ edges: row().edges.slice(0, 1) })])),
    )
    expect(both).not.toBe(none)
    expect(fewer).not.toBe(both)
    expect(reordered).toBe(both)
    expect(semanticConstraints(parseConstraints(document([])))).toBe(none)
  })
})

const group = (path: string) => path.split('/').slice(0, 2).join('/')
/** 依赖图会给组环的每条边带上两端的组；这里按夹具的路径形状补出。 */
const groupCycle = (...edges: readonly ArchitectureGroupCycleEdge[]): DependencyFinding => {
  const groups = [...new Set(edges.flatMap(item => [group(item.from), group(item.to)]))].sort()
  return {
    kind: 'group-cycle',
    rule: 'group-cycle',
    message: `组之间成环：${groups.join('、')}`,
    sites: [],
    edges: edges.map(item => ({ ...item, fromGroup: group(item.from), toGroup: group(item.to) })),
    groups,
  }
}
const memberCycle: DependencyFinding = {
  kind: 'member-cycle',
  rule: 'member-cycle',
  message: `成员之间成环：${A1}、${B1}`,
  sites: [],
  edges: [],
}

describe('judgeGroupCycles', () => {
  // 组环 a ↔ b：a/one → b/one、b/one → a/one。
  const forth = edge(A1, B1)
  const back = edge(B1, A1)

  it('组环 A↔B，A→B 只有一条成员边且登记了它：放行，记下用到的例外与边', () => {
    const cycle = groupCycle(forth, back)
    const only = exception('GCX-ONE', forth)
    expect(judgeGroupCycles([cycle], [only])).toEqual({
      findings: [],
      excepted: [{ finding: cycle, released: [{ edge: forth, exception: only }] }],
      unused: [],
    })
  })

  it('A→B 有两条成员边只登记一条：照常失败，登记的边仍算用上', () => {
    const cycle = groupCycle(forth, edge(A2, B1), back)
    const judged = judgeGroupCycles([cycle], [exception('GCX-ONE', forth)])
    expect(judged.findings).toEqual([cycle])
    expect(judged.excepted).toEqual([])
    expect(judged.unused).toEqual([])
    // 两条都登记就放行。
    const both = judgeGroupCycles([cycle], [exception('GCX-BOTH', forth, edge(A2, B1))])
    expect(both.findings).toEqual([])
    expect(both.excepted[0]?.released.map(item => item.edge)).toEqual([forth, edge(A2, B1)])
  })

  it('登记的边不在图里：例外算没用上，写明这条边与裁定链接', () => {
    const ghost = edge('packages/a/ghost', B1)
    const judged = judgeGroupCycles([groupCycle(forth, back)], [exception('GCX-GHOST', ghost)])
    expect(judged.findings).toHaveLength(1)
    expect(judged.unused).toHaveLength(1)
    expect(judged.unused[0]?.kind).toBe('unused-group-cycle-exception')
    expect(judged.unused[0]?.message).toContain('GCX-GHOST')
    expect(judged.unused[0]?.message).toContain('packages/a/ghost → packages/b/one')
    expect(judged.unused[0]?.message).toContain(RULING)
  })

  it('登记的边在图里但不在任何组环里（组环已消失）：同样没用上', () => {
    const judged = judgeGroupCycles([], [exception('GCX-GONE', forth)])
    expect(judged.findings).toEqual([])
    expect(judged.unused.map(finding => finding.message)).toEqual([
      expect.stringContaining(`${A1} → ${B1}`),
    ])
  })

  it('一条例外里有的边用上、有的没用上：放行照旧，例外只就没用上的边报一条发现', () => {
    const stale = edge(A1, 'packages/c/gone')
    const judged = judgeGroupCycles(
      [groupCycle(forth, back)],
      [exception('GCX-HALF', forth, stale)],
    )
    expect(judged.excepted).toHaveLength(1)
    expect(judged.unused).toHaveLength(1)
    expect(judged.unused[0]?.message).toContain('packages/a/one → packages/c/gone')
    expect(judged.unused[0]?.message).not.toContain(`${A1} → ${B1}`)
  })

  it('三个组 A→B→C→A：登记 C→A 即放行；登记与环无关的边不放行', () => {
    const ring = groupCycle(edge(A1, B1), edge(B1, C1), edge(C1, A1))
    const released = judgeGroupCycles([ring], [exception('GCX-RING', edge(C1, A1))])
    expect(released.findings).toEqual([])
    expect(released.unused).toEqual([])
    const unrelated = judgeGroupCycles([ring], [exception('GCX-OFF', edge(A2, C1))])
    expect(unrelated.findings).toEqual([ring])
    expect(unrelated.excepted).toEqual([])
    expect(unrelated.unused).toHaveLength(1)
  })

  it('去掉登记的边后还有环：照常失败（两个环共用的边只登记其一）', () => {
    // A→B→A 与 A→C→A 共一个分量；只登记 A→B 去不掉 A→C→A。
    const cycle = groupCycle(edge(A1, B1), edge(B1, A1), edge(A1, C1), edge(C1, A1))
    expect(judgeGroupCycles([cycle], [exception('GCX-AB', edge(A1, B1))]).findings).toEqual([cycle])
    // 登记 A→B 与 A→C 两条就去掉了。
    expect(
      judgeGroupCycles([cycle], [exception('GCX-AB-AC', edge(A1, B1), edge(A1, C1))]).findings,
    ).toEqual([])
  })

  it('一个组环用到两条例外时都记下', () => {
    const cycle = groupCycle(forth, edge(A2, B1), back)
    const first = exception('GCX-1', forth)
    const second = exception('GCX-2', edge(A2, B1))
    const judged = judgeGroupCycles([cycle], [first, second])
    expect(judged.findings).toEqual([])
    expect(judged.excepted[0]?.released.map(item => item.exception.id)).toEqual(['GCX-1', 'GCX-2'])
  })

  it('成员环不受例外影响；缺两端组信息的旧组环无法重判，照常失败', () => {
    const cycle = groupCycle(forth, back)
    const only = exception('GCX-ONE', forth)
    expect(judgeGroupCycles([memberCycle, cycle], [only]).findings).toEqual([memberCycle])
    const legacy: DependencyFinding = {
      ...cycle,
      edges: cycle.edges.map(({ from, to }) => ({ from, to })),
    }
    expect(judgeGroupCycles([legacy], [only]).findings).toEqual([legacy])
  })

  it('放行说明行写出组、例外 id、裁定链接、放行的边与理由', () => {
    const judged = judgeGroupCycles([groupCycle(forth, back)], [exception('GCX-ONE', forth)])
    const line = exceptedLine(judged.excepted[0]!)
    expect(line).toContain('组环 packages/a、packages/b')
    expect(line).toContain('例外 GCX-ONE')
    expect(line).toContain(RULING)
    expect(line).toContain(`${A1} → ${B1}`)
    expect(line).toContain('上下文组装感知工具')
  })
})

describe('回路状态的硬线', () => {
  const forth = edge(A1, B1)
  const back = edge(B1, A1)
  const only = exception('GCX-ONE', forth)
  const lines = (findings: readonly DependencyFinding[], exceptions = [only]) => ({
    ...directionLines({ findings }, exceptions),
    acceptanceLock: { status: 'judged' as const, violations: [] },
    sensors: { status: 'unjudged' as const, reason: '只在严格模式下判' },
  })

  it('放行的组环不算硬线，但在硬线一段写出例外、裁定链接与放行的边', () => {
    const judged = lines([groupCycle(forth, back)])
    expect(judged.cycles).toEqual([])
    expect(hardLinesBroken(judged)).toBe(false)
    const text = hardLineLines(judged).join('\n')
    expect(text).toContain('  环 0')
    expect(text).toContain('GCX-ONE')
    expect(text).toContain(RULING)
    expect(text).toContain(`${A1} → ${B1}`)
  })

  it('成员环与没用上的例外都是环这条硬线', () => {
    const judged = lines([memberCycle])
    expect(judged.cycles.map(finding => finding.kind)).toEqual([
      'member-cycle',
      'unused-group-cycle-exception',
    ])
    expect(hardLinesBroken(judged)).toBe(true)
  })

  it('没有例外，或登记的边去不掉环时，组环照常是硬线', () => {
    const cycle = groupCycle(forth, edge(A2, B1), back)
    for (const exceptions of [[], [only]]) {
      const judged = lines([cycle], exceptions)
      expect(judged.cycles.map(finding => finding.kind)).toEqual(['group-cycle'])
      expect(judged.exceptedCycles).toEqual([])
      expect(hardLinesBroken(judged)).toBe(true)
    }
  })
})
