#!/usr/bin/env node
import { auditRanges, resolveBaseline } from '../core/task-context.ts'
import { resolve } from 'node:path'
import { inspect, readAcceptanceLockConfig, render } from './lock.ts'
import { subjectRoot } from '../core/subject.ts'

const USAGE = `用法：omne-acceptance-lock [--base <基线提交或分支>] [--root <检出目录>]
列出基线以来碰过验收文件的提交与未提交的验收改动，判验收锁破没破。
  --base  缺省依次取环境变量 BASELINE、任务上下文的基线、origin/main、main。
  --root  被检查的检出，缺省取 OMNE_SUBJECT_ROOT，再取当前目录所在 Git 仓库的根。
配置：repo-toolchain.config.json 的 acceptanceLock 一节。
退出 0 锁没破；1 有未解决的违规；2 用法错误、基线不存在或 Git 出错。`

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
