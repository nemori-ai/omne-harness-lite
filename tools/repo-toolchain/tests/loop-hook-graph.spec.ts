// @module-tag slow
// 归慢层：每条用例在临时 git 仓库里建提交、跑 dependency-cruiser（基线一次全量，改动一层）。
// 收工钩子的依赖图只换改过的文件的边：新边闭成环、新边违反方向规则要报，新边不闭环不报；去掉的边不再在图里；
// 成员清单里的解析字段变了就不量依赖项，只出一句。对照：同一棵树上整张工作树图的成员边与环。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workingGraph, type DependencyGraph } from '../src/deps/graph.ts'
import { readLoopConfig } from '../src/loop/config.ts'
import { findingsOf } from '../src/loop/hook.ts'
import { hookGraph, RESOLUTION_NOTE } from '../src/loop/hook-graph.ts'
import { measureForHook } from '../src/loop/hook-measure.ts'
import { changeSince } from '../src/loop/run.ts'
import { readMetricsConfig } from '../src/metrics/config.ts'
import { runner } from './fixtures/group-cycle.ts'
import { commit, removeTemporaries, repository, write } from './fixtures/loop-canary/repository.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  removeTemporaries()
})

const X = 'packages/context/x'
const Y = 'packages/tool/y'
const Z = 'packages/context/z'
const A = 'apps/a'

const source = (imports: readonly string[]) =>
  `${imports.map((path, index) => `import { v as v${index} } from '${path}'`).join('\n')}\nexport const v = ${imports.length === 0 ? '1' : imports.map((_, index) => `v${index}`).join(' + ')}\n`

/** 基线：x → y，z 与 a 不导入别人；y 有包名。返回被检树与基线提交。 */
function subject(): { readonly root: string; readonly base: string } {
  const root = repository()
  write(root, 'tsconfig.base.json', '{}\n')
  write(root, `${X}/src/index.ts`, source(['../../../tool/y/src/index.ts']))
  write(root, `${Y}/src/index.ts`, source([]))
  write(
    root,
    `${Y}/package.json`,
    `${JSON.stringify({ name: '@omne-harness/y', version: '0.0.1' })}\n`,
  )
  write(root, `${Z}/src/index.ts`, source([]))
  write(root, `${A}/src/index.ts`, source([]))
  const base = commit(root, 'base')
  vi.stubEnv('OMNE_SUBJECT_ROOT', root)
  vi.stubEnv('OMNE_RUNNER_ROOT', runner(null))
  vi.stubEnv('OMNE_DEP_GRAPH_CACHE', '0')
  return { root, base }
}

function measured(root: string, base: string): DependencyGraph {
  const result = hookGraph(root, changeSince(root, base))
  if (result.kind !== 'graph') throw new Error('应当量了依赖项')
  return result.graph
}

const pairs = (graph: Pick<DependencyGraph, 'edges'>) =>
  graph.edges.map(edge => `${edge.from}→${edge.to}`)
const cycleMessages = (graph: DependencyGraph) =>
  graph.findings
    .filter(finding => finding.kind === 'member-cycle' || finding.kind === 'group-cycle')
    .map(finding => finding.message)

describe('收工钩子的依赖图只换改过的文件的边', { timeout: 120_000 }, () => {
  it('新边闭成环：成员环与组环都在，与整张工作树图相同', () => {
    const { root, base } = subject()
    write(root, `${Y}/src/index.ts`, source(['../../../context/x/src/index.ts']))
    const graph = measured(root, base)
    expect(pairs(graph)).toEqual([`${X}→${Y}`, `${Y}→${X}`])
    expect(cycleMessages(graph)).toEqual([
      `成员之间成环：${X}、${Y}`,
      '组之间成环：packages/context、packages/tool',
    ])
    const whole = workingGraph(root)
    expect(pairs(graph)).toEqual(pairs(whole))
    expect(cycleMessages(graph)).toEqual(cycleMessages(whole))
    expect(graph.dependencies).toEqual(whole.dependencies)
  })

  it('新边违反方向规则：产品包依赖应用，报 product-not-outward', () => {
    const { root, base } = subject()
    write(root, `${Z}/src/index.ts`, source(['../../../../apps/a/src/index.ts']))
    const graph = measured(root, base)
    expect(
      graph.findings.filter(finding => finding.kind === 'dependency-rule').map(f => f.rule),
    ).toEqual(['product-not-outward'])
    expect(pairs(graph)).toContain(`${Z}→${A}`)
  })

  it('新边不闭环（未跟踪的新文件 z → y）：边在，不报环；没改的 x → y 照旧从基线来', () => {
    const { root, base } = subject()
    write(root, `${Z}/src/extra.ts`, source(['../../../tool/y/src/index.ts']))
    const graph = measured(root, base)
    expect(pairs(graph)).toEqual([`${X}→${Y}`, `${Z}→${Y}`])
    expect(cycleMessages(graph)).toEqual([])
    expect(graph.modules).toContain(`${Z}/src/extra.ts`)
    expect(pairs(graph)).toEqual(pairs(workingGraph(root)))
  })

  it('两个改过的文件，前一个导入后一个：后一个自己的导入照样在', () => {
    const { root, base } = subject()
    write(root, `${X}/src/index.ts`, `// 改过\n${source(['../../../tool/y/src/index.ts'])}`)
    write(root, `${Y}/src/index.ts`, source(['../../../context/z/src/index.ts']))
    const graph = measured(root, base)
    expect(pairs(graph)).toEqual([`${X}→${Y}`, `${Y}→${Z}`])
    expect(pairs(graph)).toEqual(pairs(workingGraph(root)))
  })

  it('改过的文件去掉了导入：那条边不再在图里', () => {
    const { root, base } = subject()
    write(root, `${X}/src/index.ts`, source([]))
    expect(pairs(measured(root, base))).toEqual([])
  })

  it('基线上就有的违规：改了别的文件时仍在；改的正是违规的那个文件并去掉导入后不再在', () => {
    const { root } = subject()
    write(root, `${Z}/src/index.ts`, source(['../../../../apps/a/src/index.ts']))
    const violating = commit(root, 'z imports a')
    const rules = (graph: DependencyGraph) =>
      graph.findings.filter(finding => finding.kind === 'dependency-rule').map(f => f.rule)
    write(root, `${X}/src/extra.ts`, source([]))
    expect(rules(measured(root, violating))).toEqual(['product-not-outward'])
    write(root, `${Z}/src/index.ts`, source([]))
    expect(rules(measured(root, violating))).toEqual([])
  })

  it('基线图这次现算才报「已备好」，第二次读缓存不报', () => {
    const { root, base } = subject()
    write(root, `${Z}/src/index.ts`, source(['../../../tool/y/src/index.ts']))
    expect(hookGraph(root, changeSince(root, base)).prepared).toBe(true)
    expect(hookGraph(root, changeSince(root, base)).prepared).toBe(false)
  })
})

describe('解析配置变了', { timeout: 120_000 }, () => {
  it('成员清单的包名变了：不量依赖项，只出那一句，不报边与硬线', () => {
    const { root, base } = subject()
    write(
      root,
      `${Y}/package.json`,
      `${JSON.stringify({ name: '@omne-harness/y2', version: '0.0.1' })}\n`,
    )
    write(root, `${Y}/src/index.ts`, source(['../../../context/x/src/index.ts']))
    expect(hookGraph(root, changeSince(root, base)).kind).toBe('resolution')
    const readings = measureForHook(root, base, readLoopConfig(), readMetricsConfig())
    const texts = findingsOf(readings).map(finding => finding.text)
    expect(texts).toContain(RESOLUTION_NOTE)
    expect(texts.filter(text => text.includes('硬线') || text.includes('跨成员依赖'))).toEqual([])
  })

  it('根上的 tsconfig 内容变了：不量依赖项；新加的根配置不算', () => {
    const { root, base } = subject()
    write(root, 'tsconfig.build.json', '{}\n')
    expect(hookGraph(root, changeSince(root, base)).kind).toBe('graph')
    write(root, 'tsconfig.base.json', '{ "compilerOptions": {} }\n')
    expect(hookGraph(root, changeSince(root, base)).kind).toBe('resolution')
  })

  it('成员清单只改了版本号：照常量，新边闭成的环照报', () => {
    const { root, base } = subject()
    write(
      root,
      `${Y}/package.json`,
      `${JSON.stringify({ name: '@omne-harness/y', version: '0.0.2' })}\n`,
    )
    write(root, `${Y}/src/index.ts`, source(['../../../context/x/src/index.ts']))
    expect(hookGraph(root, changeSince(root, base)).kind).toBe('graph')
    const readings = measureForHook(root, base, readLoopConfig(), readMetricsConfig())
    const texts = findingsOf(readings).map(finding => finding.text)
    expect(texts).not.toContain(RESOLUTION_NOTE)
    expect(texts.some(text => text.includes(`成员之间成环：${X}、${Y}`))).toBe(true)
  })
})
