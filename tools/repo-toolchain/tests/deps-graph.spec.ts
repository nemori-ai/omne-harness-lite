// 依赖图：dependency-cruiser 的输出怎样收成成员边与违规，成员、组之间的环，以及按提交取的基线图。
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ignoredDirectories } from '../src/core/git.ts'
import {
  graphOf,
  requireCruiserTypeScript,
  revisionGraph,
  workingGraph,
  type CruiseOutput,
} from '../src/deps/graph.ts'
import {
  commit,
  git,
  removeTemporaries,
  temporaryDirectory,
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

  it('文件级的依赖事实逐处保留：测试里的也在，成员内部、内建模块与解析失败的不在', () => {
    // 方向规则要按源文件判角色，所以不能只有按成员对归并的边；源范围是 src/** 全部，包含测试与 testing 入口。
    const output: CruiseOutput = {
      modules: [
        {
          source: 'packages/model/m/src/index.ts',
          dependencies: [
            dependency('@omne-harness/n', 'packages/model/n/src/index.ts'),
            dependency('./local.ts', 'packages/model/m/src/local.ts'),
            { ...dependency('node:path', 'path'), dependencyTypes: ['core', 'import'] },
            { ...dependency('@omne-harness/gone', '@omne-harness/gone'), couldNotResolve: true },
          ],
        },
        {
          source: 'packages/model/m/tests/m.spec.ts',
          dependencies: [dependency('@omne-harness/n', 'packages/model/n/dist/index.js')],
        },
      ],
      summary: { violations: [] },
    }
    expect(graphOf('/nonexistent', output).dependencies).toEqual([
      {
        path: 'packages/model/m/src/index.ts',
        line: 1,
        specifier: '@omne-harness/n',
        resolved: 'packages/model/n/src/index.ts',
      },
      {
        path: 'packages/model/m/tests/m.spec.ts',
        line: 1,
        specifier: '@omne-harness/n',
        resolved: 'packages/model/n/dist/index.js',
      },
    ])
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

  it('被 git 忽略的目录里的模块不进工作树的图：变异沙箱的依赖不算新增的边', () => {
    const { root } = members()
    write(root, '.gitignore', 'node_modules/\n.stryker-tmp*\n')
    commit(root, 'ignore sandboxes')
    write(
      root,
      'packages/.stryker-tmp-x/sandbox-y/src/index.ts',
      "import { c } from '../../../model/c/src/index.ts'\nexport const copy = c\n",
    )
    expect(pairs(workingGraph(root).edges)).toEqual([
      'packages/model/a → packages/model/b',
      'packages/model/b → packages/model/c',
    ])
    expect(workingGraph(root).members.map(member => member.path)).not.toContain(
      'packages/.stryker-tmp-x/sandbox-y',
    )
  })

  it('被 git 忽略的目录里的违规不进工作树的图：沙箱里的文件环不算仓库的违规', () => {
    // 缺陷：withoutIgnoredModules 只滤了模块、没滤违规，本地沙箱的环让每次收工都报硬线。
    const { root } = members()
    write(root, '.gitignore', 'node_modules/\n.stryker-tmp*\n')
    commit(root, 'ignore sandboxes')
    const sandbox = 'packages/.stryker-tmp-x/sandbox-y/src'
    write(root, `${sandbox}/p.ts`, "import { q } from './q.ts'\nexport const p = q\n")
    write(root, `${sandbox}/q.ts`, "import { p } from './p.ts'\nexport const q = p\n")
    expect(workingGraph(root).findings).toEqual([])
  })

  it('不在 git 仓库里的目录照常出图：没有忽略规则可言，不抛错', () => {
    // 缺陷：workingGraph 无条件跑 git，`omne-deps --root <非 git 目录>` 从能用变成 not a git repository。
    const root = temporaryDirectory('omne-deps-nogit-')
    write(root, 'tsconfig.base.json', '{}\n')
    write(
      root,
      'packages/model/a/src/index.ts',
      "import { b } from '../../b/src/index.ts'\nexport const a = b\n",
    )
    write(root, 'packages/model/b/src/index.ts', 'export const b = 1\n')
    expect(ignoredDirectories(root)).toEqual(new Set())
    expect(pairs(workingGraph(root).edges)).toEqual(['packages/model/a → packages/model/b'])
  })

  it('工具链的分层：每条规则种一处违规都被报出，CLI 入口与向下的依赖放行', () => {
    const root = repository()
    write(root, 'tsconfig.base.json', '{}\n')
    const at = (path: string, text: string) => write(root, `tools/repo-toolchain/src/${path}`, text)
    write(root, 'tools/test-runner/src/run.ts', 'export const run = 1\n')
    at('core/git.ts', 'export const git = 1\n')
    at('loop/run.ts', "import { git } from '../core/git.ts'\nexport const loop = git\n")
    at('report/render.ts', "import { loop } from '../loop/run.ts'\nexport const page = loop\n")
    at('arch/view.ts', "import { page } from '../report/render.ts'\nexport const view = page\n")
    at('metrics/report.ts', "import { view } from '../arch/view.ts'\nexport const report = view\n")
    at(
      'core/scan.ts',
      "import { report } from '../metrics/report.ts'\nexport const scan = report\n",
    )
    at(
      'deps/graph.ts',
      "import { run } from '../../../test-runner/src/run.ts'\nexport const graph = run\n",
    )
    at(
      'metrics/cli.ts',
      "import { view } from '../arch/view.ts'\nimport { loop } from '../loop/run.ts'\nexport const cli = [view, loop]\n",
    )
    const found = workingGraph(root)
      .findings.filter(finding => finding.kind === 'dependency-rule')
      .map(finding => `${finding.rule} ${finding.sites[0]?.path ?? ''}`)
      .sort()
    expect(found).toEqual([
      'toolchain-checks-not-pages tools/repo-toolchain/src/arch/view.ts',
      'toolchain-core-stays-low tools/repo-toolchain/src/core/scan.ts',
      'toolchain-metrics-below-arch tools/repo-toolchain/src/metrics/report.ts',
      'toolchain-not-unpublished tools/repo-toolchain/src/deps/graph.ts',
      'toolchain-report-below-loop tools/repo-toolchain/src/report/render.ts',
    ])
  })
})

describe('dependency-cruiser 的 TypeScript', () => {
  it('找不到 TypeScript 就报错，不让 .ts 被悄悄漏掉；同级 node_modules 里有它就放行', () => {
    const root = temporaryDirectory('omne-cruiser-ts-')
    const bin = join(root, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs')
    mkdirSync(join(bin, '..'), { recursive: true })
    writeFileSync(bin, '')
    expect(() => requireCruiserTypeScript(bin)).toThrow('dependency-cruiser 找不到 TypeScript')
    mkdirSync(join(root, 'node_modules/typescript'), { recursive: true })
    writeFileSync(join(root, 'node_modules/typescript/package.json'), '{}')
    expect(() => requireCruiserTypeScript(bin)).not.toThrow()
  })
})
