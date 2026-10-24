#!/usr/bin/env node
// `pnpm run lint:deps`：dependency-cruiser 的规则违规、成员与组之间的环，以及 `constraints.json`（schema 3）方向行的命中。
// 有任何一项退出 1，工具出错退出 2。与 clean loop、`pnpm run metrics` 读同一张图（deps/graph.ts）；
// 预设与方向行都只从运行检查器的仓库读（core/subject.ts），`--root` 只改变被检查的树。
import { resolve } from 'node:path'
import { readRunnerConstraints } from '../arch/constraints.ts'
import {
  directionFindings,
  directionHits,
  directionPairs,
  memberPairCount,
} from '../arch/directions.ts'
import { workingGraph, type DependencyFinding, type DependencyGraph } from './graph.ts'

const USAGE = '用法：[--root <检出目录>]'

/** 方向行的检查结果与给人看的那一行；runner 没有 constraints.json 或文件是 schema 1、2 时不检查。 */
function directionCheck(graph: DependencyGraph): {
  readonly findings: readonly DependencyFinding[]
  readonly summary: string
} {
  const constraints = readRunnerConstraints()
  if (constraints.kind === 'missing')
    return { findings: [], summary: `依赖方向：runner 没有 ${constraints.path}，未检查` }
  const pairs = directionPairs(constraints.value)
  if (pairs.length === 0)
    return { findings: [], summary: `依赖方向：${constraints.path} 没有方向行` }
  const findings = directionFindings(
    directionHits(graph.dependencies, pairs, constraints.value.roles),
  )
  return {
    findings,
    summary: `依赖方向：检查了 ${constraints.value.directions?.length ?? 0} 条方向行、${memberPairCount(pairs)} 个成员对，命中 ${findings.length} 处`,
  }
}

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
  const directions = directionCheck(graph)
  const findings = [...graph.findings, ...directions.findings]
  for (const finding of findings) {
    const at = finding.sites[0]
    console.log(`  error ${finding.message}${at === undefined ? '' : `（${at.path}:${at.line}）`}`)
  }
  console.log(directions.summary)
  console.log(
    findings.length === 0
      ? `✔ 没有依赖违规、方向命中，也没有成员或组之间的环（${graph.members.length} 个成员、${graph.edges.length} 条成员边）`
      : `✗ ${findings.length} 处依赖违规、方向命中或环`,
  )
  return findings.length === 0 ? 0 : 1
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
