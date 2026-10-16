#!/usr/bin/env node
// `pnpm run lint:deps`：dependency-cruiser 的规则违规，加上成员与组之间的环。有任何一项退出 1，工具出错退出 2。
// 与 clean loop、`make metrics` 读同一张图（deps/graph.ts），规则只从运行检查器的仓库读。
import { resolve } from 'node:path'
import { workingGraph } from './graph.ts'

const USAGE = '用法：[--root <检出目录>]'

function main(argv: readonly string[]): number {
  let root = process.cwd()
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1]
    if (argv[index] !== '--root' || value === undefined || value === '')
      throw new Error(`认不出的参数 ${argv[index] ?? ''}\n${USAGE}`)
    root = resolve(value)
    index += 1
  }
  const graph = workingGraph(root)
  for (const finding of graph.findings) {
    const at = finding.sites[0]
    console.log(`  error ${finding.message}${at === undefined ? '' : `（${at.path}:${at.line}）`}`)
  }
  console.log(
    graph.findings.length === 0
      ? `✔ 没有依赖违规，也没有成员或组之间的环（${graph.members.length} 个成员、${graph.edges.length} 条成员边）`
      : `✗ ${graph.findings.length} 处依赖违规或环`,
  )
  return graph.findings.length === 0 ? 0 : 1
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
