// 架构符合性报告的方向行取依赖事实时，哪些失败记成「依赖事实不可得」：只有 dependency-cruiser 或 Git 的已知失败。
import { describe, expect, it } from 'vitest'
import { directionFacts } from '../src/arch/directions.ts'
import { DependencyGraphUnavailable, type DependencyGraph } from '../src/deps/graph.ts'

const GRAPH: DependencyGraph = {
  members: [],
  modules: [],
  edges: [],
  dependencies: [],
  findings: [],
}

describe('directionFacts', () => {
  it('取到图就交出图', () => {
    expect(directionFacts(() => GRAPH)).toEqual({ kind: 'graph', graph: GRAPH })
  })
  it('已知失败记成不可得，原因是失败的消息', () => {
    expect(
      directionFacts(() => {
        throw new DependencyGraphUnavailable('dependency-cruiser 没有给出依赖图')
      }),
    ).toEqual({ kind: 'unavailable', reason: 'dependency-cruiser 没有给出依赖图' })
  })
  it('别的异常照常抛出，不记成不可得', () => {
    const bug = new TypeError('读到了没校验过的值')
    expect(() =>
      directionFacts(() => {
        throw bug
      }),
    ).toThrow(bug)
  })
})
