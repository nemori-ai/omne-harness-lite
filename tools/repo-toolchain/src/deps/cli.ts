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

const USAGE = '用法：[--root <检出目录>]'

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

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
