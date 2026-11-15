#!/usr/bin/env node
import { resolve } from 'node:path'
import { readRunnerConstraints, type RunnerConstraints } from '../arch/constraints.ts'
import {
  directionFindings,
  directionPairs,
  judgeDirections,
  memberPairCount,
  type DirectionFinding,
} from '../arch/directions.ts'
import { workingGraph, type DependencyFinding, type DependencyGraph } from './graph.ts'

const USAGE = `用法：omne-deps [--root <检出目录>]
按依赖规则、constraints.json 的方向行与成员之间的环检查依赖图。
  --root  被检查的树，缺省为当前目录。规则、方向行与解析选项只从运行检查器的仓库读（OMNE_RUNNER_ROOT，缺省为被检查的仓库）。
环境变量：OMNE_DEP_GRAPH_CACHE=0 不读不写依赖图缓存；OMNE_ADMISSION=1 不读缓存，照常计算并写入，不设或空串为非准入，其他值报错。
退出 0 没有发现；1 有依赖违规、方向命中、角色没有文件或成员之间的环；2 用法错误、constraints.json 坏了或两份并存、依赖图算不出。`

function directionCheck(
  constraints: RunnerConstraints,
  graph: DependencyGraph,
): { readonly findings: readonly DirectionFinding[]; readonly summary: string } {
  if (constraints.kind === 'missing')
    return { findings: [], summary: `依赖方向：runner 没有 ${constraints.path}，未检查` }
  const pairs = directionPairs(constraints.value)
  if (pairs.length === 0)
    return { findings: [], summary: `依赖方向：${constraints.path} 没有方向行` }
  const findings = directionFindings(judgeDirections(constraints.value, graph))
  const unknown = findings.filter(finding => finding.kind === 'direction-unknown').length
  return {
    findings,
    summary: `依赖方向：检查了 ${constraints.value.directions?.length ?? 0} 条方向行、${memberPairCount(pairs)} 个成员对，命中 ${findings.length - unknown} 处${unknown === 0 ? '' : `，${unknown} 处角色没有文件`}`,
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
  const constraints = readRunnerConstraints()
  const graph = workingGraph(root)
  const directions = directionCheck(constraints, graph)
  const findings: readonly (DependencyFinding | DirectionFinding)[] = [
    ...graph.findings,
    ...directions.findings,
  ]
  for (const finding of findings) {
    const at = finding.sites[0]
    console.log(`  error ${finding.message}${at === undefined ? '' : `（${at.path}:${at.line}）`}`)
  }
  console.log(directions.summary)
  console.log(
    findings.length === 0
      ? `✔ 没有依赖违规、方向命中，也没有成员之间的环（${graph.members.length} 个成员、${graph.edges.length} 条成员边）`
      : `✗ ${findings.length} 处依赖违规、方向命中或环`,
  )
  return findings.length === 0 ? 0 : 1
}

if (process.argv.includes('--help')) {
  console.log(USAGE)
  process.exit(0)
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
