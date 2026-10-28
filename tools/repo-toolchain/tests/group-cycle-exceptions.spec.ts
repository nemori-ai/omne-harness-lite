// 具名组环例外（schema 3 `groupCycleExceptions`）：字段校验、按组集合完全相同放行的判定，以及回路状态硬线怎样读它。
// omne-deps 在 runner 与被检树分开的临时仓库上的行为在 group-cycle-exceptions-cli.spec.ts。
import { describe, expect, it } from 'vitest'
import { parseConstraints, semanticConstraints } from '../src/arch/constraints.ts'
import type { ArchitectureGroupCycleException } from '../src/arch/conformance-model.ts'
import { judgeGroupCycles } from '../src/arch/group-cycles.ts'
import type { DependencyFinding } from '../src/deps/graph.ts'
import { directionLines } from '../src/loop/run.ts'
import { hardLineLines, hardLinesBroken } from '../src/loop/status.ts'

const RULING = 'https://github.com/nemori-ai/omne-harness-lite/issues/675#issuecomment-6480475331'
const exception = (
  id: string,
  groups: readonly [string, string, ...string[]],
): ArchitectureGroupCycleException => ({ id, groups, ruling: RULING, reason: '上下文组装感知工具' })

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
  groups: ['packages/tool', 'packages/context'],
  ruling: RULING,
  reason: '上下文组装感知工具，工具感知运行时上下文',
  ...overrides,
})

describe('groupCycleExceptions 的校验', () => {
  it('schema 3 读出例外，组按字典序；缺省时没有例外', () => {
    expect(parseConstraints(document([row()])).groupCycleExceptions).toEqual([
      { ...row(), groups: ['packages/context', 'packages/tool'] },
    ])
    expect(parseConstraints(document(undefined)).groupCycleExceptions).toEqual([])
  })

  it('schema 1、2 带这个字段按未知字段拒绝', () => {
    for (const version of [1, 2] as const)
      expect(() => parseConstraints(document([row()], version))).toThrow(
        'unknown fields: groupCycleExceptions',
      )
  })

  it.each([
    ['不是数组', null, 'require arrays'],
    ['多出字段', [row({ source: 'docs/x.md' })], 'unknown fields: source'],
    ['缺理由', [row({ reason: undefined })], 'nonempty strings'],
    ['只有一个组', [row({ groups: ['packages/tool'] })], 'at least two groups'],
    ['组重复', [row({ groups: ['packages/tool', 'packages/tool'] })], 'duplicate values'],
    ['组不是组键', [row({ groups: ['packages/tool/tool-contract', 'apps'] })], 'group keys'],
    ['组键里有 ..', [row({ groups: ['packages/..', 'apps'] })], 'Invalid architecture path'],
    ['裁定不是链接', [row({ ruling: 'docs/x.md' })], 'https ruling link'],
    ['裁定不是 https', [row({ ruling: 'http://example.com/x' })], 'https ruling link'],
    ['id 重复', [row(), row({ groups: ['apps', 'examples'] })], 'duplicate identities'],
    ['组集合重复', [row(), row({ id: 'GCX-OTHER' })], 'repeat a group set'],
  ])('%s时拒绝', (_label, rows, message) => {
    expect(() => parseConstraints(document(rows))).toThrow(message)
  })

  it('例外参与语义比较：增删一条是语义变化，组的书写顺序不是', () => {
    const none = semanticConstraints(parseConstraints(document(undefined)))
    const one = semanticConstraints(parseConstraints(document([row()])))
    const reordered = semanticConstraints(
      parseConstraints(document([row({ groups: ['packages/context', 'packages/tool'] })])),
    )
    expect(one).not.toBe(none)
    expect(reordered).toBe(one)
    expect(semanticConstraints(parseConstraints(document([])))).toBe(none)
  })
})

const groupCycle = (groups: readonly string[]): DependencyFinding => ({
  kind: 'group-cycle',
  rule: 'group-cycle',
  message: `组之间成环：${groups.join('、')}`,
  sites: [],
  edges: [],
  groups,
})
const memberCycle: DependencyFinding = {
  kind: 'member-cycle',
  rule: 'member-cycle',
  message: '成员之间成环：packages/context/x、packages/tool/y',
  sites: [],
  edges: [],
}

describe('judgeGroupCycles', () => {
  const contextTool = exception('GCX-CONTEXT-TOOL', ['packages/context', 'packages/tool'])

  it('组集合完全相同的组环放行，记下命中的例外', () => {
    const cycle = groupCycle(['packages/context', 'packages/tool'])
    expect(judgeGroupCycles([cycle], [contextTool])).toEqual({
      findings: [],
      excepted: [{ finding: cycle, exception: contextTool }],
      unused: [],
    })
  })

  it('分量更大、更小或不同的组环照常失败，例外算没命中', () => {
    for (const groups of [
      ['packages/agent', 'packages/context', 'packages/tool'],
      ['packages/context', 'packages/session'],
    ]) {
      const cycle = groupCycle(groups)
      const judged = judgeGroupCycles([cycle], [contextTool])
      expect(judged.findings).toEqual([cycle])
      expect(judged.excepted).toEqual([])
      expect(judged.unused.map(finding => finding.kind)).toEqual(['unused-group-cycle-exception'])
    }
    // 例外比分量大：三个组的例外不放行两个组的环。
    const wide = exception('GCX-WIDE', ['packages/agent', 'packages/context', 'packages/tool'])
    expect(
      judgeGroupCycles([groupCycle(['packages/context', 'packages/tool'])], [wide]).findings,
    ).toHaveLength(1)
  })

  it('没命中的例外是一条发现，写明 id、组与裁定链接', () => {
    const judged = judgeGroupCycles([], [contextTool])
    expect(judged.unused).toHaveLength(1)
    expect(judged.unused[0]?.message).toContain('GCX-CONTEXT-TOOL')
    expect(judged.unused[0]?.message).toContain('packages/context、packages/tool')
    expect(judged.unused[0]?.message).toContain(RULING)
  })

  it('成员环与没有组集合的发现不受例外影响', () => {
    const cycle = groupCycle(['packages/context', 'packages/tool'])
    const judged = judgeGroupCycles([memberCycle, cycle], [contextTool])
    expect(judged.findings).toEqual([memberCycle])
    // 旧缓存里的组环没有 `groups`：不放行，照常失败。
    const { groups: _dropped, ...legacy } = cycle
    expect(judgeGroupCycles([legacy], [contextTool]).findings).toEqual([legacy])
  })
})

describe('回路状态的硬线', () => {
  const contextTool = exception('GCX-CONTEXT-TOOL', ['packages/context', 'packages/tool'])
  const lines = (findings: readonly DependencyFinding[], exceptions = [contextTool]) => ({
    ...directionLines({ findings }, exceptions),
    acceptanceLock: { status: 'judged' as const, violations: [] },
    sensors: { status: 'unjudged' as const, reason: '只在严格模式下判' },
  })

  it('放行的组环不算硬线，但在硬线一段写出例外与裁定链接', () => {
    const judged = lines([groupCycle(['packages/context', 'packages/tool'])])
    expect(judged.cycles).toEqual([])
    expect(hardLinesBroken(judged)).toBe(false)
    const text = hardLineLines(judged).join('\n')
    expect(text).toContain('  环 0')
    expect(text).toContain('GCX-CONTEXT-TOOL')
    expect(text).toContain(RULING)
  })

  it('成员环与没命中的例外都是环这条硬线', () => {
    const judged = lines([memberCycle])
    expect(judged.cycles.map(finding => finding.kind)).toEqual([
      'member-cycle',
      'unused-group-cycle-exception',
    ])
    expect(hardLinesBroken(judged)).toBe(true)
  })

  it('没有例外时组环照常是硬线', () => {
    const judged = lines([groupCycle(['packages/context', 'packages/tool'])], [])
    expect(judged.cycles.map(finding => finding.kind)).toEqual(['group-cycle'])
    expect(judged.exceptedCycles).toEqual([])
    expect(hardLinesBroken(judged)).toBe(true)
  })
})
