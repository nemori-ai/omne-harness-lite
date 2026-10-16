// 依赖图：dependency-cruiser 的输出怎样收成成员边与违规，成员、组之间的环，以及按提交取的基线图。
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { graphOf, revisionGraph, workingGraph, type CruiseOutput } from '../src/deps/graph.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const dependency = (module: string, resolved: string) => ({
  module,
  resolved,
  couldNotResolve: false,
  dependencyTypes: ['local'],
})

describe('graphOf', () => {
  it('只把产品源码里指向别的成员的依赖收成边，测试与成员内部的依赖不算', () => {
    const output: CruiseOutput = {
      modules: [
        {
          source: 'packages/model/m/src/index.ts',
          dependencies: [
            dependency('@omne-harness/n', 'packages/model/n/src/index.ts'),
            dependency('./local.ts', 'packages/model/m/src/local.ts'),
          ],
        },
        {
          source: 'packages/model/m/tests/m.spec.ts',
          dependencies: [dependency('@omne-harness/n', 'packages/model/n/src/index.ts')],
        },
        { source: 'packages/model/n/src/index.ts', dependencies: [] },
      ],
      summary: { violations: [] },
    }
    const graph = graphOf('/nonexistent', output)
    expect(graph.members.map(member => member.path)).toEqual([
      'packages/model/m',
      'packages/model/n',
    ])
    expect(graph.edges).toEqual([
      {
        from: 'packages/model/m',
        to: 'packages/model/n',
        sites: [{ path: 'packages/model/m/src/index.ts', line: 1, specifier: '@omne-harness/n' }],
      },
    ])
    expect(graph.findings).toEqual([])
  })

  it('规则违规带规则名、成员对与导入处；文件环单列；成员与组的环由边算出', () => {
    const output: CruiseOutput = {
      modules: [
        {
          source: 'packages/session/p/src/index.ts',
          dependencies: [dependency('@omne-harness/q', 'packages/session/q/src/index.ts')],
        },
        {
          source: 'packages/session/q/src/index.ts',
          dependencies: [
            dependency('@omne-harness/p', 'packages/session/p/src/index.ts'),
            dependency('@omne-harness/x', 'packages/infra/x/src/index.ts'),
          ],
        },
        {
          source: 'packages/infra/x/src/index.ts',
          dependencies: [dependency('@omne-harness/p', 'packages/session/p/src/index.ts')],
        },
      ],
      summary: {
        violations: [
          {
            from: 'packages/session/q/src/index.ts',
            to: 'packages/infra/x/src/index.ts',
            rule: { name: 'capability-not-sdk', severity: 'error' },
          },
          {
            from: 'packages/session/p/src/index.ts',
            to: 'packages/session/q/src/index.ts',
            rule: { name: 'no-circular', severity: 'error' },
            cycle: [
              { name: 'packages/session/q/src/index.ts' },
              { name: 'packages/session/p/src/index.ts' },
            ],
          },
        ],
      },
    }
    const graph = graphOf('/nonexistent', output)
    const byKind = (kind: string) => graph.findings.filter(finding => finding.kind === kind)
    expect(byKind('dependency-rule')).toEqual([
      expect.objectContaining({
        rule: 'capability-not-sdk',
        edges: [{ from: 'packages/session/q', to: 'packages/infra/x' }],
        sites: [{ path: 'packages/session/q/src/index.ts', line: 1, specifier: '@omne-harness/x' }],
      }),
    ])
    expect(byKind('file-cycle').map(finding => finding.message)).toEqual([
      '文件之间成环：packages/session/p/src/index.ts → packages/session/q/src/index.ts → packages/session/p/src/index.ts',
    ])
    expect(byKind('member-cycle').map(finding => finding.message)).toEqual([
      '成员之间成环：packages/infra/x、packages/session/p、packages/session/q',
    ])
    expect(byKind('group-cycle').map(finding => finding.message)).toEqual([
      '组之间成环：packages/infra、packages/session',
    ])
  })
})

describe('真实检出上的依赖图', { timeout: 60_000 }, () => {
  /** 两个成员：a 用相对路径导入 b；只在基线之后加上 b 到 c 的依赖。 */
  function members(): { root: string; base: string } {
    const root = repository()
    write(root, '.gitignore', 'node_modules/\n')
    write(root, 'tsconfig.base.json', '{}\n')
    write(
      root,
      'packages/model/a/src/index.ts',
      "import { b } from '../../b/src/index.ts'\nexport const a = b\n",
    )
    write(root, 'packages/model/b/src/index.ts', 'export const b = 1\n')
    write(root, 'packages/model/c/src/index.ts', 'export const c = 1\n')
    const base = commit(root, 'members')
    write(
      root,
      'packages/model/b/src/index.ts',
      "import { c } from '../../c/src/index.ts'\nexport const b = c\n",
    )
    return { root, base }
  }
  const pairs = (edges: readonly { from: string; to: string }[]) =>
    edges.map(edge => `${edge.from} → ${edge.to}`)

  it('工作树的图含未提交的改动；基线的图读那个提交，且按提交缓存在 git 目录里，工作树保持干净', () => {
    const { root, base } = members()
    expect(pairs(workingGraph(root).edges)).toEqual([
      'packages/model/a → packages/model/b',
      'packages/model/b → packages/model/c',
    ])
    expect(pairs(revisionGraph(root, base).edges)).toEqual(['packages/model/a → packages/model/b'])
    const cache = join(root, '.git', 'omne-dep-graph')
    expect(readdirSync(cache).filter(name => name.startsWith(base))).toHaveLength(1)
    expect(readdirSync(cache).filter(name => name.startsWith('tree-'))).toEqual([])
    expect(git(root, 'status', '--porcelain')).toBe('M packages/model/b/src/index.ts')
  })
})
