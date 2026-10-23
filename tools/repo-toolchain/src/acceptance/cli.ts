#!/usr/bin/env node
// 验收锁入口：`--base <ref>` 给任务基线；不给时按统一规则取（环境变量 BASELINE，再取任务上下文的基线，再取 origin/main，最后取 main）。退出码 0 表示没有未解决违规，1 表示仍有未解决违规，2 表示用法或 Git 出错。
import { auditRanges, resolveBaseline } from '../core/task-context.ts'
import { resolve } from 'node:path'
import { inspect, readAcceptanceLockConfig, render } from './lock.ts'
import { subjectRoot } from '../core/subject.ts'

const USAGE = '用法：[--base <基线提交或分支>] [--root <检出目录>]'

function main(argv: readonly string[]): number {
  let base: string | undefined
  let root = subjectRoot()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]
    if ((arg !== '--base' && arg !== '--root') || value === undefined || value === '')
      throw new Error(`认不出的参数 ${arg ?? ''}\n${USAGE}`)
    if (arg === '--base') base = value
    else root = resolve(value)
    index += 1
  }
  const config = readAcceptanceLockConfig()
  const selected = resolveBaseline(root, base)
  base = selected.targetBase
  const ranges = auditRanges(root, base)
  if (ranges.length === 0) ranges.push({ label: 'legacy task', base, head: 'HEAD' })
  const reports = ranges.map(range =>
    inspect(root, range.base, config, range.head, selected.state === 'bound'),
  )
  for (const range of ranges) console.log(`${range.label}: ${range.base}..${range.head}`)
  for (const report of reports) for (const line of render(report, config)) console.log(line)
  return reports.every(report => report.unresolvedViolations.length === 0) ? 0 : 1
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
