// group-direction 的两向夹具：故意违反必须报出，合规必须无违反；真实仓库不再需要前端到基础设施的例外。
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runRules, type SourceFile } from '../src/index.ts'
import { cycles, evaluateDirection, memberGraph, memberOf } from '../src/metrics/graph.ts'
import { collectMemberSources } from '../src/metrics/sources.ts'
import { REPOSITORY_RULES } from '../src/repository.ts'
import {
  createGroupDirection,
  GROUP_DIRECTION_POLICY,
  groupDirection,
} from '../src/rules/group-direction.ts'

const file = (path: string, text: string): SourceFile => ({ path, text })
const imports = (name: string) => `import { x } from '@omne-harness-lite/${name}'\nvoid x\n`

const core = file('packages/core/storage/src/index.ts', 'export const x = 1\n')
const sql = file('packages/infra/storage-sql/src/index.ts', imports('storage'))
const tenancy = file('packages/tenancy/account-identity-sql/src/index.ts', imports('storage'))
const host = file(
  'apps/tenancy-host/src/main.ts',
  `${imports('storage-sql')}${imports('account-identity-sql')}`,
)
const clean = [core, sql, tenancy, host]

describe('memberOf / memberGraph', () => {
  it('按路径前缀识别成员与组；根 tools/ 不是成员', () => {
    expect(memberOf('packages/tools/asset-registry-local/src/a.ts')).toEqual({
      path: 'packages/tools/asset-registry-local',
      group: 'packages/tools',
      name: 'asset-registry-local',
    })
    expect(memberOf('apps/cli/src/a.ts')?.group).toBe('apps')
    expect(memberOf('tools/ts-checks/src/cli.ts')).toBeUndefined()
  })

  it('只取产品源码的字面导入；测试、自导入与子入口的处理', () => {
    const test = file('packages/core/storage/tests/a.spec.ts', imports('storage-sql'))
    const self = file('packages/core/storage/src/self.ts', imports('storage/conformance'))
    const sub = file(
      'packages/tenancy/account-identity-sql/src/sub.ts',
      imports('storage/conformance'),
    )
    const graph = memberGraph([...clean, test, self, sub])
    expect(graph.edges.map(edge => `${edge.from} -> ${edge.to}`)).toEqual([
      'apps/tenancy-host -> packages/infra/storage-sql',
      'apps/tenancy-host -> packages/tenancy/account-identity-sql',
      'packages/infra/storage-sql -> packages/core/storage',
      'packages/tenancy/account-identity-sql -> packages/core/storage',
    ])
    expect(graph.edges[3]?.sites).toHaveLength(2)
  })
})

describe('cycles', () => {
  it('只报节点数大于一的强连通分量', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
      { from: 'c', to: 'd' },
    ]
    expect(cycles(['a', 'b', 'c', 'd'], edges)).toEqual([['a', 'b', 'c']])
    expect(cycles(['a', 'b'], [{ from: 'a', to: 'b' }])).toEqual([])
  })
})

describe('group-direction', () => {
  it('登记在仓库路径规则里，随 lint:rules 执行', () => {
    expect(REPOSITORY_RULES).toContain(groupDirection)
  })

  it('合规夹具无违反', () => {
    expect(groupDirection.check(clean)).toEqual([])
  })

  it('core 依赖 infra ⇒ 在导入处报出', () => {
    const bad = file('packages/core/storage/src/bad.ts', imports('storage-sql'))
    expect(groupDirection.check([...clean, bad])).toMatchObject([
      { rule: 'group-direction', path: bad.path, line: 1 },
      // core ↔ infra 同时成了成员环与组环，各在环上两条边的首个导入处报出
      { path: bad.path },
      { path: sql.path },
      { path: bad.path },
      { path: sql.path },
    ])
  })

  it('领域直接依赖 infra ⇒ 报出；登记为例外后不报', () => {
    const bad = file('packages/tenancy/account-identity-sql/src/bad.ts', imports('storage-sql'))
    const found = groupDirection.check([...clean, bad])
    expect(found).toMatchObject([{ path: bad.path, line: 1 }])
    expect(found[0]?.message).toContain('只由装配层选用')
    const excepted = createGroupDirection({
      ...GROUP_DIRECTION_POLICY,
      exceptions: [
        {
          from: 'packages/tenancy/account-identity-sql',
          to: 'packages/infra/storage-sql',
          reason: '夹具',
        },
      ],
    })
    expect(excepted.check([...clean, bad])).toEqual([])
  })

  it('同层领域互依不报，成环才报', () => {
    const session = file('packages/session/session-log-jsonl/src/index.ts', imports('storage'))
    const forward = file(
      'packages/tenancy/account-identity-sql/src/f.ts',
      imports('session-log-jsonl'),
    )
    expect(groupDirection.check([...clean, session, forward])).toEqual([])
    const back = file(
      'packages/session/session-log-jsonl/src/b.ts',
      imports('account-identity-sql'),
    )
    const kinds = evaluateDirection(
      memberGraph([...clean, session, forward, back]),
      GROUP_DIRECTION_POLICY,
    ).map(finding => finding.kind)
    expect(kinds).toEqual(['member-cycle', 'group-cycle'])
  })

  it('未登记层位的新组 ⇒ 报出，不静默放过', () => {
    const stray = file('packages/newgroup/thing/src/index.ts', 'export const y = 1\n')
    const found = groupDirection.check([...clean, stray])
    expect(found).toHaveLength(1)
    expect(found[0]?.message).toContain('packages/newgroup')
  })

  // 归慢层：重 CPU：读取并解析整个真实仓库的成员源码。
  it('真实仓库严格方向通过；注回已退役的前端到SQL依赖必须失败', { tags: ['slow'] }, () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url))
    const sources = collectMemberSources(root)
    expect(sources.length).toBeGreaterThan(100)
    expect(runRules(sources, [groupDirection])).toEqual([])
    const strict = createGroupDirection({ ...GROUP_DIRECTION_POLICY, exceptions: [] })
    expect(strict.check(sources)).toEqual([])
    const forbidden = file(
      'packages/frontend/client-local-state-sqlite/src/reintroduced-sql.ts',
      imports('storage-sql'),
    )
    const found = strict.check([...sources, forbidden])
    expect(found.length).toBeGreaterThan(0)
    expect(
      found.every(v => v.path.startsWith('packages/frontend/client-local-state-sqlite/src/')),
    ).toBe(true)
  })
})
